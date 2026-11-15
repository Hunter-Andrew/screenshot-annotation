//! Changing the capture hotkey: register the new combination first, so a conflict leaves the old
//! hotkey working, then release the old one and persist. The OS registry is behind a trait so the
//! ordering is unit-tested; the real one wraps tauri-plugin-global-shortcut (see lib.rs).

use std::io;

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
}
