//! Whether the editor window should be maximized when it is created or shown. Pure, so it is
//! tested on any OS (`rustc --test src/editor_window.rs`, or `cargo test`).
//!
//! The editor opens maximized (normal window chrome kept; not borderless fullscreen). The user's
//! choice lasts for the session only: if they un-maximize it, hiding or closing it and opening it
//! again must not fight them. Nothing is written to disk.

/// What the user last had the editor window do, remembered in memory when it was hidden or closed:
/// `None` if that never happened this session (the window has not been shown yet).
pub fn should_maximize(last_maximized: Option<bool>) -> bool {
    last_maximized.unwrap_or(true)
}

/// What the editor hotkey does (ticket 56): close the editor to the tray when it is open, otherwise open it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Toggle {
    Show,
    Hide,
}

/// Open means on screen and not minimized: a hidden or minimized editor is brought up, a shown one is put away.
pub fn toggle_action(visible: bool, minimized: bool) -> Toggle {
    if visible && !minimized {
        Toggle::Hide
    } else {
        Toggle::Show
    }
}

/// A second start of the app normally brings the editor up (the running instance is told). Right after this
/// instance started it must not: a duplicate start racing the first at sign-in or after an install would pop the
/// editor open on its own, and the editor never opens by itself at startup.
pub const STARTUP_GRACE: std::time::Duration = std::time::Duration::from_secs(15);

pub fn second_launch_opens_editor(since_start: std::time::Duration) -> bool {
    since_start >= STARTUP_GRACE
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn the_hotkey_closes_an_open_editor_and_opens_a_hidden_or_minimized_one() {
        assert_eq!(toggle_action(true, false), Toggle::Hide);
        assert_eq!(toggle_action(false, false), Toggle::Show);
        assert_eq!(toggle_action(true, true), Toggle::Show);
        assert_eq!(toggle_action(false, true), Toggle::Show);
    }

    #[test]
    fn a_second_launch_right_after_startup_does_not_open_the_editor() {
        assert!(!second_launch_opens_editor(Duration::ZERO));
        assert!(!second_launch_opens_editor(STARTUP_GRACE - Duration::from_millis(1)));
        assert!(second_launch_opens_editor(STARTUP_GRACE));
        assert!(second_launch_opens_editor(Duration::from_secs(3600)));
    }

    #[test]
    fn first_creation_is_maximized() {
        assert!(should_maximize(None));
    }

    #[test]
    fn previously_maximized_is_maximized_again() {
        assert!(should_maximize(Some(true)));
    }

    #[test]
    fn previously_unmaximized_stays_normal() {
        assert!(!should_maximize(Some(false)));
    }
}
