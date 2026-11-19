//! The pure decisions of Drawing mode (ticket 52): what its hotkey or tray item does, and how its
//! overlay windows are named. No dependencies, so it is tested on any OS (`rustc --test
//! src/drawing_plan.rs`, or `cargo test`); `drawing.rs` does the window work.

/// Drawing mode's overlay windows are named `drawing-<monitor index>`; the capture overlay's are `overlay-<index>`.
pub const LABEL_PREFIX: &str = "drawing-";

pub fn label(monitor: usize) -> String {
    format!("{LABEL_PREFIX}{monitor}")
}

pub fn is_label(name: &str) -> bool {
    name.strip_prefix(LABEL_PREFIX).is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_digit()))
}

/// What a press of the hotkey (or a click on the tray item) does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Toggle {
    Start,
    End,
    /// A capture overlay or countdown is open: the mode does not start under it.
    Ignore,
}

/// `active`: Drawing mode is on. `capturing`: a capture (its countdown or overlay) is in progress.
/// Leaving the mode is always allowed; starting it is not while a capture is in progress.
pub fn toggle(active: bool, capturing: bool) -> Toggle {
    match (active, capturing) {
        (true, _) => Toggle::End,
        (false, false) => Toggle::Start,
        (false, true) => Toggle::Ignore,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_hotkey_starts_the_mode_and_pressing_it_again_ends_it() {
        assert_eq!(toggle(false, false), Toggle::Start);
        assert_eq!(toggle(true, false), Toggle::End);
    }

    #[test]
    fn the_mode_does_not_start_while_a_capture_is_in_progress() {
        assert_eq!(toggle(false, true), Toggle::Ignore);
    }

    #[test]
    fn the_mode_can_always_be_left() {
        assert_eq!(toggle(true, true), Toggle::End);
    }

    #[test]
    fn windows_are_named_by_monitor_and_never_clash_with_the_capture_overlays() {
        assert_eq!(label(0), "drawing-0");
        assert_eq!(label(12), "drawing-12");
        assert!(is_label("drawing-0"));
        assert!(is_label("drawing-12"));
        for name in ["overlay-0", "drawing-", "drawing-x", "drawing-1a", "editor", "settings", "countdown", ""] {
            assert!(!is_label(name), "{name:?}");
        }
    }
}
