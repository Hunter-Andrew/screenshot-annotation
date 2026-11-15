//! Retry rule for creating a window whose label may still belong to a window that is closing
//! (ticket 36). Pure, so it is tested on any OS (`rustc --test src/window_open.rs`, or `cargo test`).
//!
//! Tauri frees a window's label only once the window is destroyed, which happens a moment after
//! the user clicks its close button. Opening the same window again inside that moment fails with
//! "a webview with the label ... already exists". That is not a real failure: the caller retries
//! after a short pause, looking again for an existing window each time, until the old one is gone.

use std::time::Duration;

/// Pauses between attempts; the number of attempts is one more than the number of pauses.
pub const RETRY_PAUSES: [Duration; 5] = [
    Duration::from_millis(50),
    Duration::from_millis(100),
    Duration::from_millis(200),
    Duration::from_millis(400),
    Duration::from_millis(800),
];

/// What one attempt came to.
pub enum Attempt<T, E> {
    /// Done: the window was created, or an existing one was focused instead.
    Done(T),
    /// The label is still taken by a closing window; try again after the next pause.
    LabelTaken(E),
    /// Any other error: retrying cannot help.
    Failed(E),
}

/// Runs `attempt` until it is `Done`, `Failed`, or the pauses run out. `pause` sleeps (a closure,
/// so tests do not wait). Returns the result and how many attempts were made.
pub fn retry<T, E>(
    pauses: &[Duration],
    mut pause: impl FnMut(Duration),
    mut attempt: impl FnMut() -> Attempt<T, E>,
) -> (Result<T, E>, usize) {
    let mut made = 0;
    loop {
        made += 1;
        match attempt() {
            Attempt::Done(value) => return (Ok(value), made),
            Attempt::Failed(e) => return (Err(e), made),
            Attempt::LabelTaken(e) => match pauses.get(made - 1) {
                Some(wait) => pause(*wait),
                None => return (Err(e), made),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_try_success_does_not_pause() {
        let mut paused = 0;
        let (r, made) = retry::<_, &str>(&RETRY_PAUSES, |_| paused += 1, || Attempt::Done(7));
        assert_eq!((r, made, paused), (Ok(7), 1, 0));
    }

    #[test]
    fn waits_out_a_closing_window_then_succeeds() {
        let mut left = 2;
        let mut waited = Vec::new();
        let (r, made) = retry(
            &RETRY_PAUSES,
            |d| waited.push(d),
            || {
                if left > 0 {
                    left -= 1;
                    Attempt::LabelTaken("label taken")
                } else {
                    Attempt::Done("opened")
                }
            },
        );
        assert_eq!((r, made), (Ok("opened"), 3));
        assert_eq!(waited, vec![RETRY_PAUSES[0], RETRY_PAUSES[1]]);
    }

    #[test]
    fn a_label_that_never_frees_gives_up_with_the_error() {
        let (r, made) = retry::<(), _>(&RETRY_PAUSES, |_| {}, || Attempt::LabelTaken("still taken"));
        assert_eq!((r, made), (Err("still taken"), RETRY_PAUSES.len() + 1));
    }

    #[test]
    fn other_errors_are_not_retried() {
        let mut paused = 0;
        let (r, made) = retry::<(), _>(&RETRY_PAUSES, |_| paused += 1, || Attempt::Failed("webview2 missing"));
        assert_eq!((r, made, paused), (Err("webview2 missing"), 1, 0));
    }

    #[test]
    fn total_wait_is_short_enough_to_feel_instant_but_covers_a_close() {
        let total: Duration = RETRY_PAUSES.iter().sum();
        assert!(total >= Duration::from_millis(500) && total <= Duration::from_secs(3));
    }
}
