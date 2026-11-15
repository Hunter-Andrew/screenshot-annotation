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

#[cfg(test)]
mod tests {
    use super::*;

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
