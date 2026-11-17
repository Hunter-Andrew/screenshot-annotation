//! The delay timer's countdown (ticket 22): a small transparent, click-through badge window that
//! follows the mouse pointer and shows 3, 2, 1 (`src/countdown/Countdown.tsx`). What the numbers are
//! and where the badge sits is in `delay.rs` (pure, tested); this file is the window and the clock.
//!
//! Windows-only in practice (the pointer comes from capture.rs). It cannot be run on the Linux dev
//! box, so docs/release-checklist.md has the steps to check it by hand.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl};

use crate::geometry::{self, MonitorBounds};
use crate::{capture, delay, diag};

pub const LABEL: &str = "countdown";
/// Event carrying the number now shown (or null once over) to the badge page.
pub const EVENT: &str = "countdown";
/// How often the badge is moved to follow the pointer.
const FOLLOW_EVERY: Duration = Duration::from_millis(25);

/// The number the badge shows now, for a badge page that loads after the first tick.
#[derive(Default)]
pub struct CountdownState(Mutex<Option<u32>>);

#[tauri::command]
pub fn countdown_remaining(state: tauri::State<'_, CountdownState>) -> Option<u32> {
    *state.0.lock().unwrap_or_else(|p| p.into_inner())
}

fn publish(app: &AppHandle, number: Option<u32>) {
    *app.state::<CountdownState>().0.lock().unwrap_or_else(|p| p.into_inner()) = number;
    let _ = app.emit(EVENT, number);
}

/// The badge window, created hidden and click-through, never taking focus from the app being
/// arranged (the user is opening a menu there).
fn open_badge(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let window = crate::new_window(app, LABEL, WebviewUrl::App("index.html#countdown".into()))
        .title("Countdown")
        .decorations(false)
        .resizable(false)
        .shadow(false)
        .transparent(true)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()?;
    window.set_ignore_cursor_events(true)?;
    window.set_size(PhysicalSize::new(delay::BADGE_SIZE, delay::BADGE_SIZE))?;
    Ok(window)
}

/// Move the badge next to the pointer, on whichever monitor the pointer is on.
fn follow_pointer(app: &AppHandle, window: &tauri::WebviewWindow) {
    let Ok((x, y)) = capture::cursor_position() else { return };
    let monitors: Vec<MonitorBounds> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| MonitorBounds { x: m.position().x, y: m.position().y, width: m.size().width, height: m.size().height })
        .collect();
    let monitor = geometry::monitor_at(&monitors, x, y)
        .map(|i| (monitors[i].x, monitors[i].y, monitors[i].width, monitors[i].height))
        .unwrap_or((x, y, delay::BADGE_SIZE, delay::BADGE_SIZE));
    let (bx, by) = delay::badge_position((x, y), monitor);
    let _ = window.set_position(PhysicalPosition::new(bx, by));
}

/// Show the countdown for `total` and return once it is over and the badge is gone from the screen,
/// so it is never in the picture. A badge that cannot be created is logged and skipped: the wait
/// still happens and the capture still follows.
pub fn run(app: &AppHandle, total: Duration) {
    let badge = match open_badge(app) {
        Ok(window) => Some(window),
        Err(e) => {
            diag::log(&format!("countdown: could not open the badge window ({e}); counting down without it"));
            None
        }
    };
    let started = Instant::now();
    let mut shown = None;
    let mut visible = false;
    while let Some(number) = delay::shown_number(total, started.elapsed()) {
        if shown != Some(number) {
            publish(app, Some(number));
            shown = Some(number);
        }
        if let Some(window) = &badge {
            follow_pointer(app, window);
            if !visible {
                visible = window.show().is_ok();
            }
        }
        std::thread::sleep(FOLLOW_EVERY);
    }
    publish(app, None);
    if let Some(window) = badge {
        let _ = window.destroy();
        // Give Windows a moment to take the badge off the screen before the screen is read.
        std::thread::sleep(crate::HIDE_SETTLE);
    }
    diag::log(&format!("countdown: {} s over", total.as_secs()));
}
