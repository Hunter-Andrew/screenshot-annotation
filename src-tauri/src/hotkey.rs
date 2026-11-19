//! Changing the capture hotkey: register the new combination first, so a conflict leaves the old
//! hotkey working, then release the old one and persist. The OS registry is behind a trait so the
//! ordering is unit-tested; the real one wraps tauri-plugin-global-shortcut (see lib.rs).

use std::io;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::print_screen_key::is_bare_print_screen;

#[derive(Debug, PartialEq)]
pub enum RegisterError {
    /// Not a combination the OS can register.
    Invalid,
    /// Another app already owns it.
    Taken,
}

pub trait ShortcutRegistry {
    fn register(&self, accelerator: &str) -> Result<(), RegisterError>;
    fn unregister(&self, accelerator: &str);
    fn is_registered(&self, accelerator: &str) -> bool;
}

/// Error strings are the wire format `src/platform/tauriBridge.ts` maps back to a reason.
pub fn error_code(e: &RegisterError) -> &'static str {
    match e {
        RegisterError::Invalid => "invalid",
        RegisterError::Taken => "conflict",
    }
}

/// Swap `old` for `new`. `persist` saves the choice; if it fails, the old hotkey is restored.
pub fn change_hotkey(
    registry: &impl ShortcutRegistry,
    old: &str,
    new: &str,
    persist: impl FnOnce() -> io::Result<()>,
) -> Result<(), &'static str> {
    if new == old {
        // Already chosen. If it is not live (taken at startup), this retries the registration.
        if registry.is_registered(new) {
            return Ok(());
        }
        return registry.register(new).map_err(|e| error_code(&e));
    }
    registry.register(new).map_err(|e| error_code(&e))?;
    registry.unregister(old);
    if persist().is_err() {
        registry.unregister(new);
        let _ = registry.register(old);
        return Err("failed");
    }
    Ok(())
}

/// Whether the key part of an accelerator is Print Screen, alone or with modifiers (mirrors `usesPrintScreen`
/// in `src/settings/hotkey.ts`).
pub fn uses_print_screen(accelerator: &str) -> bool {
    accelerator.rsplit('+').next().is_some_and(|key| key.trim().eq_ignore_ascii_case("PrintScreen"))
}

fn same_accelerator(a: &str, b: &str) -> bool {
    a.trim().eq_ignore_ascii_case(b.trim())
}

/// Why a demo-tool hotkey (pointer highlight, drawing mode; ticket 49) may not be `new`, as the wire code
/// `src/platform/tauriBridge.ts` maps back to a message: Print Screen, the capture hotkey, or the other
/// demo hotkey. `None` when it may (whether another app owns it is only known by registering it).
pub fn demo_refusal(new: &str, capture: &str, other_demo: &str) -> Option<&'static str> {
    if uses_print_screen(new) {
        Some("print-screen")
    } else if same_accelerator(new, capture) {
        Some("capture-hotkey")
    } else if same_accelerator(new, other_demo) {
        Some("other-demo")
    } else {
        None
    }
}

/// The capture hotkey may not take a combination a demo tool already uses.
pub fn clashes_with_demo(new: &str, pointer_highlight: &str, drawing_mode: &str) -> bool {
    same_accelerator(new, pointer_highlight) || same_accelerator(new, drawing_mode)
}

/// Sends bare Print Screen to the Raw Input listener (RegisterHotKey never fires for it on
/// Andrew's laptop; ticket 26, ADR 0007) and every other combination to the global-shortcut plugin,
/// so `change_hotkey` keeps its ordering and rollback unchanged. If the listener cannot start, bare
/// Print Screen falls back to the plugin registration and `degraded` is set, so the failure can be
/// shown (`get_hotkey` reports it); it is never registered with both (no double firing).
pub struct Routed<'a, P, L> {
    pub plugin: P,
    pub listener: L,
    pub degraded: &'a AtomicBool,
    pub log: fn(&str),
}

impl<P: ShortcutRegistry, L: ShortcutRegistry> ShortcutRegistry for Routed<'_, P, L> {
    fn register(&self, accelerator: &str) -> Result<(), RegisterError> {
        if !is_bare_print_screen(accelerator) {
            return self.plugin.register(accelerator);
        }
        self.degraded.store(false, Ordering::SeqCst);
        if self.listener.register(accelerator).is_ok() {
            // A fallback registration from an earlier failure must not stay: it would fire too.
            if self.plugin.is_registered(accelerator) {
                self.plugin.unregister(accelerator);
            }
            return Ok(());
        }
        (self.log)("hotkey: the Raw Input listener for Print Screen failed; falling back to RegisterHotKey, which may never fire for Print Screen");
        let fallback = self.plugin.register(accelerator);
        self.degraded.store(fallback.is_ok(), Ordering::SeqCst);
        fallback
    }
    fn unregister(&self, accelerator: &str) {
        if !is_bare_print_screen(accelerator) {
            return self.plugin.unregister(accelerator);
        }
        self.listener.unregister(accelerator);
        if self.plugin.is_registered(accelerator) {
            self.plugin.unregister(accelerator);
        }
        self.degraded.store(false, Ordering::SeqCst);
    }
    /// For bare Print Screen: the listener is running. The fallback registration does not count
    /// (it is the known-bad path), so Settings shows the failure.
    fn is_registered(&self, accelerator: &str) -> bool {
        if !is_bare_print_screen(accelerator) {
            return self.plugin.is_registered(accelerator);
        }
        self.listener.is_registered(accelerator) || (self.plugin.is_registered(accelerator) && !self.degraded.load(Ordering::SeqCst))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Fake {
        held: RefCell<Vec<String>>,
        taken_by_others: Vec<String>,
    }

    impl ShortcutRegistry for Fake {
        fn register(&self, a: &str) -> Result<(), RegisterError> {
            if a.is_empty() {
                return Err(RegisterError::Invalid);
            }
            if self.taken_by_others.iter().any(|t| t == a) {
                return Err(RegisterError::Taken);
            }
            self.held.borrow_mut().push(a.into());
            Ok(())
        }
        fn unregister(&self, a: &str) {
            self.held.borrow_mut().retain(|h| h != a);
        }
        fn is_registered(&self, a: &str) -> bool {
            self.held.borrow().iter().any(|h| h == a)
        }
    }

    fn fake_holding(old: &str, taken: &[&str]) -> Fake {
        Fake { held: RefCell::new(vec![old.into()]), taken_by_others: taken.iter().map(|s| s.to_string()).collect() }
    }

    #[test]
    fn swaps_the_registration_and_persists() {
        let reg = fake_holding("ctrl+shift+s", &[]);
        let mut saved = false;
        let r = change_hotkey(&reg, "ctrl+shift+s", "ctrl+alt+k", || {
            saved = true;
            Ok(())
        });
        assert_eq!(r, Ok(()));
        assert!(saved);
        assert_eq!(*reg.held.borrow(), vec!["ctrl+alt+k".to_string()]);
    }

    #[test]
    fn a_conflict_keeps_the_old_hotkey_and_saves_nothing() {
        let reg = fake_holding("ctrl+shift+s", &["ctrl+alt+k"]);
        let r = change_hotkey(&reg, "ctrl+shift+s", "ctrl+alt+k", || panic!("must not persist"));
        assert_eq!(r, Err("conflict"));
        assert_eq!(*reg.held.borrow(), vec!["ctrl+shift+s".to_string()]);
    }

    #[test]
    fn an_unregisterable_combination_is_invalid() {
        let reg = fake_holding("ctrl+shift+s", &[]);
        assert_eq!(change_hotkey(&reg, "ctrl+shift+s", "", || Ok(())), Err("invalid"));
        assert_eq!(*reg.held.borrow(), vec!["ctrl+shift+s".to_string()]);
    }

    #[test]
    fn a_failed_save_restores_the_old_hotkey() {
        let reg = fake_holding("ctrl+shift+s", &[]);
        let r = change_hotkey(&reg, "ctrl+shift+s", "ctrl+alt+k", || Err(io::Error::other("disk full")));
        assert_eq!(r, Err("failed"));
        assert_eq!(*reg.held.borrow(), vec!["ctrl+shift+s".to_string()]);
    }

    #[test]
    fn choosing_the_live_hotkey_again_is_a_no_op_and_retries_a_dead_one() {
        let live = fake_holding("ctrl+shift+s", &[]);
        assert_eq!(change_hotkey(&live, "ctrl+shift+s", "ctrl+shift+s", || panic!("no save")), Ok(()));
        let dead = Fake { held: RefCell::new(vec![]), taken_by_others: vec!["ctrl+shift+s".into()] };
        assert_eq!(change_hotkey(&dead, "ctrl+shift+s", "ctrl+shift+s", || Ok(())), Err("conflict"));
    }

    #[test]
    fn a_free_combination_is_not_refused_for_a_demo_hotkey() {
        assert_eq!(demo_refusal("ctrl+shift+l", "ctrl+shift+s", "ctrl+shift+d"), None);
    }

    #[test]
    fn print_screen_is_refused_for_a_demo_hotkey_bare_or_with_modifiers() {
        assert_eq!(demo_refusal("PrintScreen", "ctrl+shift+s", "ctrl+shift+d"), Some("print-screen"));
        assert_eq!(demo_refusal("ctrl+PrintScreen", "ctrl+shift+s", "ctrl+shift+d"), Some("print-screen"));
        assert!(!uses_print_screen("ctrl+shift+s"));
        assert!(!uses_print_screen(""));
    }

    #[test]
    fn the_capture_hotkey_and_the_other_demo_hotkey_are_refused_for_a_demo_hotkey() {
        assert_eq!(demo_refusal("ctrl+shift+s", "ctrl+shift+s", "ctrl+shift+d"), Some("capture-hotkey"));
        assert_eq!(demo_refusal("CTRL+SHIFT+D", "ctrl+shift+s", "ctrl+shift+d"), Some("other-demo"));
    }

    #[test]
    fn the_capture_hotkey_may_not_take_a_demo_combination() {
        assert!(clashes_with_demo("ctrl+shift+l", "ctrl+shift+l", "ctrl+shift+d"));
        assert!(clashes_with_demo("ctrl+shift+d", "ctrl+shift+l", "ctrl+shift+d"));
        assert!(!clashes_with_demo("ctrl+alt+k", "ctrl+shift+l", "ctrl+shift+d"));
    }

    #[test]
    fn a_demo_hotkey_change_keeps_the_register_first_rollback() {
        let reg = fake_holding("ctrl+shift+l", &["ctrl+alt+j"]);
        assert_eq!(change_hotkey(&reg, "ctrl+shift+l", "ctrl+alt+j", || panic!("must not persist")), Err("conflict"));
        assert_eq!(*reg.held.borrow(), vec!["ctrl+shift+l".to_string()]);
        let r = change_hotkey(&reg, "ctrl+shift+l", "ctrl+alt+k", || Err(io::Error::other("disk full")));
        assert_eq!(r, Err("failed"));
        assert_eq!(*reg.held.borrow(), vec!["ctrl+shift+l".to_string()]);
    }

    // Routing between the Raw Input listener and the plugin.
    struct Failing(Fake);
    impl ShortcutRegistry for Failing {
        fn register(&self, _: &str) -> Result<(), RegisterError> {
            Err(RegisterError::Taken)
        }
        fn unregister(&self, a: &str) {
            self.0.unregister(a)
        }
        fn is_registered(&self, a: &str) -> bool {
            self.0.is_registered(a)
        }
    }

    const PS: &str = "PrintScreen";

    fn silent(_: &str) {}

    #[test]
    fn bare_print_screen_goes_to_the_listener_and_never_to_the_plugin() {
        let degraded = AtomicBool::new(false);
        let r = Routed { plugin: fake_holding("ctrl+shift+s", &[]), listener: Fake::default(), degraded: &degraded, log: silent };
        assert_eq!(change_hotkey(&r, "ctrl+shift+s", PS, || Ok(())), Ok(()));
        assert_eq!(*r.listener.held.borrow(), vec![PS.to_string()]);
        assert!(r.plugin.held.borrow().is_empty(), "no RegisterHotKey for Print Screen: it would fire twice");
        assert!(r.is_registered(PS));
        assert!(!degraded.load(Ordering::SeqCst));
    }

    #[test]
    fn modifier_combinations_keep_using_the_plugin() {
        let degraded = AtomicBool::new(false);
        let r = Routed { plugin: fake_holding("ctrl+shift+s", &[]), listener: Fake::default(), degraded: &degraded, log: silent };
        assert_eq!(change_hotkey(&r, "ctrl+shift+s", "ctrl+PrintScreen", || Ok(())), Ok(()));
        assert_eq!(*r.plugin.held.borrow(), vec!["ctrl+PrintScreen".to_string()]);
        assert!(r.listener.held.borrow().is_empty());
    }

    #[test]
    fn changing_away_from_print_screen_stops_the_listener() {
        let degraded = AtomicBool::new(false);
        let r = Routed { plugin: Fake::default(), listener: fake_holding(PS, &[]), degraded: &degraded, log: silent };
        assert_eq!(change_hotkey(&r, PS, "ctrl+alt+k", || Ok(())), Ok(()));
        assert!(r.listener.held.borrow().is_empty());
        assert_eq!(*r.plugin.held.borrow(), vec!["ctrl+alt+k".to_string()]);
    }

    #[test]
    fn a_failed_save_while_moving_to_print_screen_stops_the_listener_and_restores_the_old_hotkey() {
        let degraded = AtomicBool::new(false);
        let r = Routed { plugin: fake_holding("ctrl+shift+s", &[]), listener: Fake::default(), degraded: &degraded, log: silent };
        let res = change_hotkey(&r, "ctrl+shift+s", PS, || Err(io::Error::other("disk full")));
        assert_eq!(res, Err("failed"));
        assert!(r.listener.held.borrow().is_empty());
        assert_eq!(*r.plugin.held.borrow(), vec!["ctrl+shift+s".to_string()]);
    }

    #[test]
    fn a_failed_save_while_leaving_print_screen_restarts_the_listener() {
        let degraded = AtomicBool::new(false);
        let r = Routed { plugin: Fake::default(), listener: fake_holding(PS, &[]), degraded: &degraded, log: silent };
        let res = change_hotkey(&r, PS, "ctrl+alt+k", || Err(io::Error::other("disk full")));
        assert_eq!(res, Err("failed"));
        assert_eq!(*r.listener.held.borrow(), vec![PS.to_string()]);
        assert!(r.plugin.held.borrow().is_empty());
    }

    #[test]
    fn a_listener_failure_falls_back_to_the_plugin_and_is_reported_as_not_registered() {
        let degraded = AtomicBool::new(false);
        let r = Routed { plugin: Fake::default(), listener: Failing(Fake::default()), degraded: &degraded, log: silent };
        assert_eq!(r.register(PS), Ok(()));
        assert_eq!(*r.plugin.held.borrow(), vec![PS.to_string()]);
        assert!(degraded.load(Ordering::SeqCst));
        assert!(!r.is_registered(PS), "Settings must be able to show the failure");
        // Unregistering clears the fallback and the flag.
        r.unregister(PS);
        assert!(r.plugin.held.borrow().is_empty());
        assert!(!degraded.load(Ordering::SeqCst));
    }

    #[test]
    fn if_the_fallback_also_fails_the_error_is_the_usual_conflict() {
        let degraded = AtomicBool::new(false);
        let plugin = Fake { taken_by_others: vec![PS.into()], ..Fake::default() };
        let r = Routed { plugin, listener: Failing(Fake::default()), degraded: &degraded, log: silent };
        assert_eq!(change_hotkey(&r, "x", PS, || panic!("must not persist")), Err("conflict"));
        assert!(!degraded.load(Ordering::SeqCst));
    }

    #[test]
    fn choosing_print_screen_again_retries_a_dead_listener() {
        let degraded = AtomicBool::new(true);
        let r = Routed { plugin: fake_holding(PS, &[]), listener: Fake::default(), degraded: &degraded, log: silent };
        assert!(!r.is_registered(PS));
        // The listener can start this time: new == old retries it.
        assert_eq!(change_hotkey(&r, PS, PS, || panic!("no save")), Ok(()));
        assert!(r.listener.is_registered(PS));
        assert!(r.plugin.held.borrow().is_empty(), "the fallback registration is dropped, else it fires twice");
        assert!(!degraded.load(Ordering::SeqCst));
    }
}
