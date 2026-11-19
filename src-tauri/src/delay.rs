//! The delay timer (ticket 22): which delays exist, what number the countdown shows when, and where
//! the little countdown badge sits next to the mouse pointer. Pure, so it is tested on any OS
//! (`rustc --test src/delay.rs`, or `cargo test`). The window and the clock live in `countdown.rs`.

use std::time::Duration;

/// The delays on offer, in seconds: the tray menu and the editor's top bar list exactly these.
pub const CHOICES: [u32; 3] = [3, 5, 10];

/// The edge of the square countdown badge, in physical pixels.
pub const BADGE_SIZE: u32 = 72;
/// How far the badge sits from the pointer, in physical pixels, so it never covers what is pointed at.
pub const POINTER_GAP: i32 = 24;

/// How long to wait after the editor was minimized for a capture started from it (the Capture button or the
/// hotkey with the editor open) before the screen is read: just the short settle `HIDE_SETTLE` that every window
/// that steps out of the way gets, so Windows has taken the window off the screen. There is no extra wait on top:
/// minimizing is the quickest way to get the editor out of the picture, and the capture should feel instant. The
/// risk is that the minimize animation is still on screen when the frame is grabbed; it can only be checked on
/// Windows (release checklist, "The editor is out of the picture"). With the editor not open there is nothing to
/// wait for: no wait at all. One place, so the wait can be tuned (and tested) in one go.
pub fn wait_after_minimizing_editor(editor_was_open: bool, settle: Duration) -> Duration {
    if editor_was_open { settle } else { Duration::ZERO }
}

/// The delay for a number of seconds the page asked for; `None` for anything not in `CHOICES`
/// (the page is not trusted to start a one-hour timer).
pub fn delay_for(seconds: u32) -> Option<Duration> {
    CHOICES.contains(&seconds).then(|| Duration::from_secs(seconds as u64))
}

/// The number the countdown shows `elapsed` after it started: whole seconds left, rounded up, so a
/// 3 s timer reads 3, 2, 1 and is over (`None`) exactly when `total` has passed.
pub fn shown_number(total: Duration, elapsed: Duration) -> Option<u32> {
    let left = total.checked_sub(elapsed).filter(|left| !left.is_zero())?;
    Some(left.as_millis().div_ceil(1000) as u32)
}

/// A monitor's rectangle on the virtual screen, physical pixels: x, y, width, height.
pub type Rect = (i32, i32, u32, u32);

/// Top-left of the badge for a pointer at `cursor` on `monitor`: below and to the right of the
/// pointer, flipped to the other side where that would run off the monitor, and kept on it.
pub fn badge_position(cursor: (i32, i32), monitor: Rect) -> (i32, i32) {
    let (mx, my, mw, mh) = monitor;
    let size = BADGE_SIZE as i32;
    let place = |at: i32, start: i32, len: u32| {
        let end = start + len as i32;
        let after = at + POINTER_GAP;
        let chosen = if after + size <= end { after } else { at - POINTER_GAP - size };
        chosen.clamp(start, (end - size).max(start))
    };
    (place(cursor.0, mx, mw), place(cursor.1, my, mh))
}

/// Where one countdown stands: waiting, cancelled by Esc, or over (the capture has started).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Phase {
    Running,
    Cancelled,
    Fired,
}

/// One running countdown, shared between the thread that counts and the Esc handler. Whichever
/// comes first wins and the other is told so: Esc before the countdown ends cancels the capture;
/// Esc after the capture started (a key press that arrives late) is ignored.
pub struct Countdown(std::sync::Mutex<Phase>);

impl Countdown {
    pub fn new() -> Self {
        Countdown(std::sync::Mutex::new(Phase::Running))
    }

    fn phase(&self) -> std::sync::MutexGuard<'_, Phase> {
        self.0.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Esc was pressed. True only if this stopped a countdown that was still running.
    pub fn cancel(&self) -> bool {
        let mut phase = self.phase();
        let running = *phase == Phase::Running;
        if running {
            *phase = Phase::Cancelled;
        }
        running
    }

    /// The time is up. True if the capture may start now; false if Esc got there first (or this was
    /// already called).
    pub fn fire(&self) -> bool {
        let mut phase = self.phase();
        let running = *phase == Phase::Running;
        if running {
            *phase = Phase::Fired;
        }
        running
    }

    pub fn is_cancelled(&self) -> bool {
        *self.phase() == Phase::Cancelled
    }
}

impl Default for Countdown {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = (0, 0, 1920, 1080);

    #[test]
    fn only_three_five_and_ten_seconds_are_accepted() {
        assert_eq!(CHOICES, [3, 5, 10]);
        assert_eq!(delay_for(3), Some(Duration::from_secs(3)));
        assert_eq!(delay_for(10), Some(Duration::from_secs(10)));
        for refused in [0, 1, 4, 11, 3600] {
            assert_eq!(delay_for(refused), None, "{refused}");
        }
    }

    #[test]
    fn minimizing_the_editor_waits_only_the_150_ms_settle_before_the_screen_is_read() {
        // No 500 ms fade wait any more: capture is immediate apart from the short settle.
        assert_eq!(wait_after_minimizing_editor(true, Duration::from_millis(150)), Duration::from_millis(150));
    }

    #[test]
    fn with_no_editor_open_the_screen_is_read_at_once() {
        assert_eq!(wait_after_minimizing_editor(false, Duration::from_millis(150)), Duration::ZERO);
    }

    #[test]
    fn the_countdown_reads_three_two_one_then_ends() {
        let total = Duration::from_secs(3);
        let at = |ms| shown_number(total, Duration::from_millis(ms));
        assert_eq!(at(0), Some(3));
        assert_eq!(at(999), Some(3));
        assert_eq!(at(1000), Some(2));
        assert_eq!(at(2000), Some(1));
        assert_eq!(at(2999), Some(1));
        assert_eq!(at(3000), None);
        assert_eq!(at(9000), None);
    }

    #[test]
    fn a_ten_second_countdown_starts_at_ten() {
        assert_eq!(shown_number(Duration::from_secs(10), Duration::ZERO), Some(10));
    }

    #[test]
    fn the_badge_sits_below_and_right_of_the_pointer() {
        assert_eq!(badge_position((500, 400), SCREEN), (524, 424));
    }

    #[test]
    fn the_badge_flips_left_and_up_at_the_right_and_bottom_edges() {
        let (x, y) = badge_position((1900, 1070), SCREEN);
        assert_eq!((x, y), (1900 - 24 - 72, 1070 - 24 - 72));
    }

    #[test]
    fn the_badge_follows_a_monitor_left_of_the_primary_one() {
        let left: Rect = (-1920, 0, 1920, 1080);
        assert_eq!(badge_position((-50, 10), left), (-50 - 24 - 72, 34));
        assert_eq!(badge_position((-1900, 10), left), (-1876, 34));
    }

    #[test]
    fn the_badge_stays_on_a_monitor_smaller_than_it_wants() {
        let tiny: Rect = (0, 0, 50, 50);
        assert_eq!(badge_position((10, 10), tiny), (0, 0));
    }

    #[test]
    fn escape_cancels_a_countdown_that_is_still_running() {
        let countdown = Countdown::new();
        assert!(!countdown.is_cancelled());
        assert!(countdown.cancel());
        assert!(countdown.is_cancelled());
        // The countdown then ends without the capture: it cannot fire any more.
        assert!(!countdown.fire());
    }

    #[test]
    fn a_countdown_that_runs_out_fires_the_capture_once() {
        let countdown = Countdown::new();
        assert!(countdown.fire());
        assert!(!countdown.fire());
        assert!(!countdown.is_cancelled());
    }

    #[test]
    fn escape_after_the_capture_started_is_ignored() {
        let countdown = Countdown::new();
        assert!(countdown.fire());
        assert!(!countdown.cancel());
        assert!(!countdown.is_cancelled());
    }

    #[test]
    fn a_second_escape_changes_nothing() {
        let countdown = Countdown::new();
        assert!(countdown.cancel());
        assert!(!countdown.cancel());
        assert!(countdown.is_cancelled());
    }
}
