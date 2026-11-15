//! One physical Print Screen press = one capture, decided from Raw Input events (ticket 26,
//! ADR 0007). Pure logic with no Windows types, so it is unit-tested on any OS; `raw_input.rs`
//! feeds it. Windows may deliver only the key-up (break) for Print Screen, or both the key-down
//! (make) and the key-up, and it repeats the make while the key is held, so:
//! - a make triggers (the first one of a press); repeats of it are ignored;
//! - a break triggers only when no make was seen for that press;
//! - any second trigger within `DEBOUNCE_MS` of the last one is ignored (a duplicate delivery);
//! - the key counts as held until its break, or until `STALE_HELD_MS` pass without any event
//!   (a lost break must not swallow every later press).

/// Window in which a second trigger counts as the same press.
pub const DEBOUNCE_MS: u64 = 400;
/// A "held" key with no event for this long is treated as released (the slowest keyboard
/// auto-repeat delay is about 1 s).
pub const STALE_HELD_MS: u64 = 1500;

/// Whether the configured accelerator is exactly bare Print Screen (the only one that uses Raw
/// Input; everything else, Ctrl+Print Screen included, stays on RegisterHotKey).
pub fn is_bare_print_screen(accelerator: &str) -> bool {
    accelerator.trim().eq_ignore_ascii_case("PrintScreen")
}

/// One Raw Input keyboard event for the Print Screen key.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct KeyEvent {
    /// RI_KEY_BREAK: a key-up.
    pub is_break: bool,
    /// RAWKEYBOARD.Flags, for the log.
    pub flags: u16,
    /// RAWKEYBOARD.MakeCode, for the log.
    pub make_code: u16,
    /// Ctrl, Alt, Shift or a Windows key was down at the time (not a bare press).
    pub modifiers_down: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Trigger {
    /// The key-down of a press.
    Make,
    /// The key-up of a press whose key-down never arrived.
    BreakOnly,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Ignore {
    AutoRepeat,
    /// The break of a press that already triggered (or was ignored) on its make.
    BreakAfterMake,
    /// Within `DEBOUNCE_MS` of the previous trigger.
    Debounced,
    /// Modifiers were held: not bare Print Screen.
    Modifiers,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Decision {
    Trigger(Trigger),
    Ignore(Ignore),
}

impl Decision {
    /// One log line fragment, e.g. "trigger (key-up only, no key-down seen)".
    pub fn describe(&self) -> &'static str {
        match self {
            Decision::Trigger(Trigger::Make) => "trigger (key-down)",
            Decision::Trigger(Trigger::BreakOnly) => "trigger (key-up only, no key-down seen)",
            Decision::Ignore(Ignore::AutoRepeat) => "ignored (auto-repeat of a held key)",
            Decision::Ignore(Ignore::BreakAfterMake) => "ignored (key-up of a press already handled on its key-down)",
            Decision::Ignore(Ignore::Debounced) => "ignored (duplicate within the debounce window)",
            Decision::Ignore(Ignore::Modifiers) => "ignored (a modifier key is held, not bare Print Screen)",
        }
    }
}

/// The log line for one raw event, e.g.
/// `raw input: PrintScreen break flags=0x0001 make_code=0x0037 modifiers=none t=1200ms`.
pub fn describe_event(e: &KeyEvent, t_ms: u64) -> String {
    format!(
        "raw input: PrintScreen {} flags={:#06x} make_code={:#06x} modifiers={} t={t_ms}ms",
        if e.is_break { "break" } else { "make" },
        e.flags,
        e.make_code,
        if e.modifiers_down { "held" } else { "none" },
    )
}

#[derive(Debug, Default)]
pub struct Decider {
    /// When the last event of the press in progress arrived (`None`: key not held).
    held_since_event: Option<u64>,
    last_trigger: Option<u64>,
}

impl Decider {
    pub fn new() -> Decider {
        Decider::default()
    }

    /// Decide what one event means. `now_ms` is any monotonic clock in milliseconds.
    pub fn on_event(&mut self, e: &KeyEvent, now_ms: u64) -> Decision {
        let held = self.held_since_event.is_some_and(|at| now_ms.saturating_sub(at) <= STALE_HELD_MS);
        if e.is_break {
            self.held_since_event = None;
            if held {
                return Decision::Ignore(Ignore::BreakAfterMake);
            }
            if e.modifiers_down {
                return Decision::Ignore(Ignore::Modifiers);
            }
            return self.trigger_unless_debounced(now_ms, Trigger::BreakOnly);
        }
        // A make.
        self.held_since_event = Some(now_ms);
        if held {
            return Decision::Ignore(Ignore::AutoRepeat);
        }
        if e.modifiers_down {
            return Decision::Ignore(Ignore::Modifiers);
        }
        self.trigger_unless_debounced(now_ms, Trigger::Make)
    }

    fn trigger_unless_debounced(&mut self, now_ms: u64, kind: Trigger) -> Decision {
        if self.last_trigger.is_some_and(|t| now_ms.saturating_sub(t) < DEBOUNCE_MS) {
            return Decision::Ignore(Ignore::Debounced);
        }
        self.last_trigger = Some(now_ms);
        Decision::Trigger(kind)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAKE: KeyEvent = KeyEvent { is_break: false, flags: 2, make_code: 0x37, modifiers_down: false };
    const BREAK: KeyEvent = KeyEvent { is_break: true, flags: 3, make_code: 0x37, modifiers_down: false };
    const T: Decision = Decision::Trigger(Trigger::Make);
    const TB: Decision = Decision::Trigger(Trigger::BreakOnly);

    #[test]
    fn make_then_break_is_one_capture_on_the_make() {
        let mut d = Decider::new();
        assert_eq!(d.on_event(&MAKE, 1000), T);
        assert_eq!(d.on_event(&BREAK, 1090), Decision::Ignore(Ignore::BreakAfterMake));
    }

    #[test]
    fn a_break_alone_is_one_capture() {
        let mut d = Decider::new();
        assert_eq!(d.on_event(&BREAK, 1000), TB);
    }

    #[test]
    fn auto_repeat_while_held_is_ignored_however_long() {
        let mut d = Decider::new();
        assert_eq!(d.on_event(&MAKE, 0), T);
        // 500 ms initial delay, then repeats every 33 ms for about 5 seconds.
        for i in 0..150u64 {
            assert_eq!(d.on_event(&MAKE, 500 + i * 33), Decision::Ignore(Ignore::AutoRepeat), "repeat {i}");
        }
        assert_eq!(d.on_event(&BREAK, 5500), Decision::Ignore(Ignore::BreakAfterMake));
    }

    #[test]
    fn a_second_press_after_the_window_triggers_again() {
        let mut d = Decider::new();
        assert_eq!(d.on_event(&MAKE, 0), T);
        assert_eq!(d.on_event(&BREAK, 80), Decision::Ignore(Ignore::BreakAfterMake));
        assert_eq!(d.on_event(&MAKE, DEBOUNCE_MS), T);
        assert_eq!(d.on_event(&BREAK, DEBOUNCE_MS + 80), Decision::Ignore(Ignore::BreakAfterMake));
    }

    #[test]
    fn a_duplicate_delivery_inside_the_window_is_ignored() {
        let mut d = Decider::new();
        assert_eq!(d.on_event(&BREAK, 0), TB);
        assert_eq!(d.on_event(&BREAK, DEBOUNCE_MS - 1), Decision::Ignore(Ignore::Debounced));
        assert_eq!(d.on_event(&BREAK, DEBOUNCE_MS), TB);
        // A quick tap-tap with makes: the second press is inside the window.
        let mut d = Decider::new();
        assert_eq!(d.on_event(&MAKE, 0), T);
        assert_eq!(d.on_event(&BREAK, 50), Decision::Ignore(Ignore::BreakAfterMake));
        assert_eq!(d.on_event(&MAKE, 100), Decision::Ignore(Ignore::Debounced));
        assert_eq!(d.on_event(&BREAK, 150), Decision::Ignore(Ignore::BreakAfterMake));
    }

    #[test]
    fn a_press_delivered_twice_triggers_once() {
        let mut d = Decider::new();
        let seq = [(&MAKE, 0), (&MAKE, 3), (&BREAK, 60), (&BREAK, 63)];
        let triggers = seq.iter().filter(|(e, t)| matches!(d.on_event(e, *t), Decision::Trigger(_))).count();
        assert_eq!(triggers, 1);
    }

    #[test]
    fn a_lost_break_does_not_swallow_later_presses() {
        let mut d = Decider::new();
        assert_eq!(d.on_event(&MAKE, 0), T);
        // The break never arrives; much later the key is pressed again.
        assert_eq!(d.on_event(&MAKE, STALE_HELD_MS + 1), T);
    }

    #[test]
    fn modifiers_held_means_not_bare_print_screen() {
        let mut d = Decider::new();
        let ctrl_make = KeyEvent { modifiers_down: true, ..MAKE };
        let ctrl_break = KeyEvent { modifiers_down: true, ..BREAK };
        assert_eq!(d.on_event(&ctrl_make, 0), Decision::Ignore(Ignore::Modifiers));
        assert_eq!(d.on_event(&ctrl_break, 50), Decision::Ignore(Ignore::BreakAfterMake));
        // Ctrl released before Print Screen: the bare break of that press must not trigger.
        assert_eq!(d.on_event(&ctrl_make, 1000), Decision::Ignore(Ignore::Modifiers));
        assert_eq!(d.on_event(&BREAK, 1100), Decision::Ignore(Ignore::BreakAfterMake));
        // A modified break-only press does not trigger either, and does not start the debounce.
        assert_eq!(d.on_event(&ctrl_break, 3000), Decision::Ignore(Ignore::Modifiers));
        assert_eq!(d.on_event(&BREAK, 3010), TB);
    }

    #[test]
    fn only_exactly_bare_print_screen_is_routed_to_raw_input() {
        assert!(is_bare_print_screen("PrintScreen"));
        assert!(is_bare_print_screen("printscreen"));
        assert!(!is_bare_print_screen("ctrl+PrintScreen"));
        assert!(!is_bare_print_screen("ctrl+shift+s"));
        assert!(!is_bare_print_screen("F12"));
        assert!(!is_bare_print_screen(""));
    }

    #[test]
    fn log_lines_show_exactly_what_arrived_and_what_was_decided() {
        assert_eq!(
            describe_event(&BREAK, 1200),
            "raw input: PrintScreen break flags=0x0003 make_code=0x0037 modifiers=none t=1200ms"
        );
        assert_eq!(
            describe_event(&KeyEvent { modifiers_down: true, ..MAKE }, 5),
            "raw input: PrintScreen make flags=0x0002 make_code=0x0037 modifiers=held t=5ms"
        );
        assert_eq!(TB.describe(), "trigger (key-up only, no key-down seen)");
    }
}
