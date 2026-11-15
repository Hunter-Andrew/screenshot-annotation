//! When to give up on a capture that never shows its overlay. Pure decision logic so it can be
//! tested anywhere; overlay.rs polls it from a helper thread and does the teardown.

use std::time::Duration;

/// After the overlay windows are created, at least one must report `overlay_ready` within this.
pub const READY_TIMEOUT: Duration = Duration::from_secs(5);
/// Freezing the monitors and creating the windows must finish within this, or the capture is stuck.
pub const START_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    /// Keep waiting.
    Wait,
    /// An overlay is up (or the capture ended): stop watching.
    Done,
    /// Tear everything down; the text says which stage never finished.
    GiveUp(&'static str),
}

/// `ready`: overlays that have reported ready. `since_opened`: time since the overlay windows
/// started opening, or `None` while the screen is still being frozen. `since_start`: time since
/// the capture was triggered.
pub fn verdict(ready: usize, since_opened: Option<Duration>, since_start: Duration) -> Verdict {
    if ready > 0 {
        return Verdict::Done;
    }
    match since_opened {
        Some(t) if t >= READY_TIMEOUT => Verdict::GiveUp("no overlay window reported ready within 5 seconds of opening"),
        Some(_) => Verdict::Wait,
        None if since_start >= START_TIMEOUT => Verdict::GiveUp("the screen was not frozen and the overlays not opened within 20 seconds"),
        None => Verdict::Wait,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: fn(u64) -> Duration = Duration::from_secs;

    #[test]
    fn waits_while_the_overlays_are_young() {
        assert_eq!(verdict(0, Some(S(4)), S(6)), Verdict::Wait);
        assert_eq!(verdict(0, None, S(19)), Verdict::Wait);
    }

    #[test]
    fn gives_up_when_no_overlay_is_ready_in_time() {
        assert!(matches!(verdict(0, Some(S(5)), S(7)), Verdict::GiveUp(_)));
    }

    #[test]
    fn gives_up_when_the_capture_never_got_as_far_as_opening_windows() {
        assert!(matches!(verdict(0, None, S(20)), Verdict::GiveUp(_)));
    }

    #[test]
    fn one_ready_overlay_ends_the_watch_however_late() {
        assert_eq!(verdict(1, Some(S(60)), S(70)), Verdict::Done);
    }
}
