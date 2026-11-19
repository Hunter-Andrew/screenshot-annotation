//! The pointer highlight (ticket 50, decisions in ticket 40): a red "laser dot" that follows the mouse
//! pointer across the whole desktop, switched on and off by its hotkey and by the checked tray item. It is
//! one small transparent, click-through, non-focusable, always-on-top window (built like the delay timer's
//! badge in `countdown.rs`) that a polling thread moves every ~16 ms. No hooks (ADR 0009): the pointer comes
//! from `capture::cursor_position()` and the left button from `GetAsyncKeyState`.
//!
//! What the maths decide (window size, position, order of changes, when a click ripples) is in `pointer.rs`
//! (pure, tested); what the dot looks like is `src/pointer/PointerDot.tsx`. This file is the window, the
//! thread and the Windows calls. It cannot be run on the Linux dev box, so docs/release-checklist.md has the
//! steps to check it by hand. The on/off state is never saved: the highlight is off at every start.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::CheckMenuItem;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, Wry};

use crate::geometry::{self, MonitorBounds};
use crate::pointer::{self, Apply, Sample, Tracker};
use crate::settings::PointerSettings;
use crate::{capture, diag, tray_menu};

pub const LABEL: &str = "pointer-highlight";
/// Event carrying whether the highlight is on (a bool) after every change, whoever asked for it.
pub const STATE_EVENT: &str = "pointer-highlight-state";
/// Event carrying the dot window's `PointerView` whenever the settings or the dot's place in the window change.
pub const VIEW_EVENT: &str = "pointer-highlight-view";
/// Event (no payload) for a left click: the dot window shows the ripple.
pub const RIPPLE_EVENT: &str = "pointer-highlight-ripple";
/// How often the dot is moved to the pointer.
const POLL_EVERY: Duration = Duration::from_millis(16);
/// How often the list of monitors is read again (a monitor can be plugged in while the dot is on).
const MONITORS_EVERY: Duration = Duration::from_millis(500);

/// What the dot window draws: the settings, and where in the window the dot's centre is (CSS pixels; the middle
/// unless the window is held back at a monitor's edge).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerView {
    pub color: String,
    pub size: String,
    pub ripple: bool,
    pub dot_x: f64,
    pub dot_y: f64,
}

impl PointerView {
    fn new(settings: &PointerSettings) -> Self {
        let middle = pointer::WINDOW_SIZE as f64 / 2.0;
        PointerView {
            color: settings.color.clone(),
            size: settings.size.clone(),
            ripple: settings.ripple,
            dot_x: middle,
            dot_y: middle,
        }
    }
}

/// The highlight while it is on: the thread that follows the pointer and how to stop it.
struct Running {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

pub struct PointerHighlightState {
    /// Some while the highlight is on.
    running: Mutex<Option<Running>>,
    /// One switch-on or switch-off at a time (creating the window takes a moment).
    transition: Mutex<()>,
    view: Mutex<PointerView>,
    /// The tray's checked item, to keep its check mark in step with the real state.
    tray_item: Mutex<Option<CheckMenuItem<Wry>>>,
}

impl PointerHighlightState {
    pub fn new(settings: &PointerSettings) -> Self {
        PointerHighlightState {
            running: Mutex::new(None),
            transition: Mutex::new(()),
            view: Mutex::new(PointerView::new(settings)),
            tray_item: Mutex::new(None),
        }
    }

    pub fn set_tray_item(&self, item: CheckMenuItem<Wry>) {
        *self.tray_item.lock().unwrap_or_else(|p| p.into_inner()) = Some(item);
    }

    fn is_on(&self) -> bool {
        self.running.lock().unwrap_or_else(|p| p.into_inner()).is_some()
    }

    fn view(&self) -> PointerView {
        self.view.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }
}

#[tauri::command]
pub fn get_pointer_highlight(state: tauri::State<'_, PointerHighlightState>) -> bool {
    state.is_on()
}

/// What the dot window draws now, for a window that loads after the first change.
#[tauri::command]
pub fn pointer_highlight_view(state: tauri::State<'_, PointerHighlightState>) -> PointerView {
    state.view()
}

/// Switch the highlight on or off (`Some`), or flip it (`None`). Returns at once: the window is created on a
/// thread of its own, because creating a window from a command or an event handler (the hotkey, the tray)
/// deadlocks on Windows (see `on_worker_thread` in lib.rs).
pub fn request(app: &AppHandle, want: Option<bool>) {
    let app = app.clone();
    std::thread::spawn(move || switch(&app, want));
}

/// The new look: kept for the next time the window opens, and sent to the open one.
pub fn apply_settings(app: &AppHandle, settings: &PointerSettings) {
    let state = app.state::<PointerHighlightState>();
    let view = {
        let mut view = state.view.lock().unwrap_or_else(|p| p.into_inner());
        view.color = settings.color.clone();
        view.size = settings.size.clone();
        view.ripple = settings.ripple;
        view.clone()
    };
    let _ = app.emit(VIEW_EVENT, view);
}

/// The hotkey changed in Settings: the tray item shows the new one.
pub fn refresh_tray_label(app: &AppHandle, accelerator: &str) {
    let state = app.state::<PointerHighlightState>();
    if let Some(item) = state.tray_item.lock().unwrap_or_else(|p| p.into_inner()).as_ref() {
        if let Err(e) = item.set_text(tray_menu::pointer_highlight_label(accelerator)) {
            diag::log(&format!("pointer highlight: could not update the tray label: {e}"));
        }
    }
}

/// Tell the tray and every window what the state is now.
fn publish(app: &AppHandle, on: bool) {
    let state = app.state::<PointerHighlightState>();
    if let Some(item) = state.tray_item.lock().unwrap_or_else(|p| p.into_inner()).as_ref() {
        if let Err(e) = item.set_checked(on) {
            diag::log(&format!("pointer highlight: could not set the tray check mark: {e}"));
        }
    }
    let _ = app.emit(STATE_EVENT, on);
}

/// Runs on a worker thread. Does nothing when the highlight is already in the wanted state (the tray's check
/// mark is still put right: a click flips it natively before this runs).
fn switch(app: &AppHandle, want: Option<bool>) {
    let state = app.state::<PointerHighlightState>();
    let _one_at_a_time = state.transition.lock().unwrap_or_else(|p| p.into_inner());
    let on_now = state.is_on();
    let on = want.unwrap_or(!on_now);
    if on == on_now {
        publish(app, on_now);
        return;
    }
    if on {
        match start(app) {
            Ok(running) => {
                *state.running.lock().unwrap_or_else(|p| p.into_inner()) = Some(running);
                diag::log("pointer highlight: on");
                publish(app, true);
            }
            Err(e) => {
                diag::log(&format!("pointer highlight: could not start ({e})"));
                publish(app, false);
            }
        }
    } else {
        let running = state.running.lock().unwrap_or_else(|p| p.into_inner()).take();
        if let Some(running) = running {
            running.stop.store(true, Ordering::SeqCst);
            // The thread closes the window as it ends; wait so a quick on again finds the label free.
            let _ = running.thread.join();
        }
        diag::log("pointer highlight: off");
        publish(app, false);
    }
}

/// The dot window, created hidden and click-through, never taking focus from the app being shown.
fn open_window(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let window = crate::new_window(app, LABEL, WebviewUrl::App("index.html#pointer-highlight".into()))
        .title("Pointer highlight")
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
    window.set_size(PhysicalSize::new(pointer::WINDOW_SIZE, pointer::WINDOW_SIZE))?;
    Ok(window)
}

fn start(app: &AppHandle) -> Result<Running, String> {
    let window = open_window(app).map_err(|e| e.to_string())?;
    exclude_from_capture(&window, "pointer highlight");
    let stop = Arc::new(AtomicBool::new(false));
    let thread = {
        let app = app.clone();
        let stop = stop.clone();
        std::thread::spawn(move || follow(&app, window, &stop))
    };
    Ok(Running { stop, thread })
}

/// Hide the dot and the ripple from screenshots and screen recordings (Windows 10 version 2004 and later; on an
/// older Windows the call fails and the dot is simply in the picture). Also used by Drawing mode's toolbar
/// (`drawing.rs`); `what` names the window in the log lines.
#[cfg(windows)]
pub(crate) fn exclude_from_capture(window: &tauri::WebviewWindow, what: &str) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};

    let Ok(handle) = window.hwnd() else {
        diag::log(&format!("{what}: no window handle, the window is not hidden from captures"));
        return;
    };
    // Tauri's HWND may come from another version of the `windows` crate: go through the raw value.
    let hwnd = HWND(handle.0 as isize as *mut _);
    // SAFETY: `hwnd` is the live dot window created above.
    if let Err(e) = unsafe { SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) } {
        diag::log(&format!("{what}: SetWindowDisplayAffinity failed ({e}); the window can show in captures"));
    }
}

#[cfg(not(windows))]
pub(crate) fn exclude_from_capture(_window: &tauri::WebviewWindow, _what: &str) {}

/// Whether the primary mouse button is down now (the left one, or the right one when the buttons are swapped
/// in Windows). Polled, never hooked (ADR 0009).
#[cfg(windows)]
fn primary_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};

    // SAFETY: neither call has preconditions. GetAsyncKeyState names the physical buttons, so a swapped
    // mouse's primary button is VK_RBUTTON.
    let key = unsafe {
        if GetSystemMetrics(SM_SWAPBUTTON) != 0 {
            VK_RBUTTON
        } else {
            VK_LBUTTON
        }
    };
    unsafe { GetAsyncKeyState(i32::from(key.0)) < 0 }
}

#[cfg(not(windows))]
fn primary_button_down() -> bool {
    false
}

/// The monitors as the pointer maths wants them: rectangle and scale factor.
fn read_monitors(app: &AppHandle) -> Vec<(MonitorBounds, f64)> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            (MonitorBounds { x: m.position().x, y: m.position().y, width: m.size().width, height: m.size().height }, m.scale_factor())
        })
        .collect()
}

/// What this tick sees: the pointer, the left button and the monitor the pointer is on. None when the pointer
/// cannot be read or there is no monitor (the tick is skipped).
fn read_sample(monitors: &[(MonitorBounds, f64)]) -> Option<Sample> {
    let cursor = capture::cursor_position().ok()?;
    let bounds: Vec<MonitorBounds> = monitors.iter().map(|(b, _)| *b).collect();
    let index = geometry::monitor_at(&bounds, cursor.0, cursor.1)?;
    let (b, scale) = &monitors[index];
    Some(Sample { cursor, left_down: primary_button_down(), monitor: (b.x, b.y, b.width, b.height), scale: *scale })
}

/// The polling thread: until `stop`, move the dot to the pointer; then close the window.
fn follow(app: &AppHandle, window: tauri::WebviewWindow, stop: &AtomicBool) {
    let state = app.state::<PointerHighlightState>();
    let mut tracker = Tracker::new();
    let mut monitors = read_monitors(app);
    let mut monitors_read = Instant::now();
    let mut visible = false;
    while !stop.load(Ordering::SeqCst) {
        if monitors_read.elapsed() >= MONITORS_EVERY {
            monitors = read_monitors(app);
            monitors_read = Instant::now();
        }
        if let Some(sample) = read_sample(&monitors) {
            let ripple_on = state.view().ripple;
            let frame = tracker.next(&sample, ripple_on);
            for change in &frame.apply {
                // Position first, then size: the size is applied at the scale of the monitor moved to.
                let _ = match *change {
                    Apply::Position(x, y) => window.set_position(PhysicalPosition::new(x, y)),
                    Apply::Size(edge) => window.set_size(PhysicalSize::new(edge, edge)),
                };
            }
            if let Some((x, y)) = frame.dot {
                let view = {
                    let mut view = state.view.lock().unwrap_or_else(|p| p.into_inner());
                    view.dot_x = x;
                    view.dot_y = y;
                    view.clone()
                };
                let _ = app.emit(VIEW_EVENT, view);
            }
            if frame.ripple {
                let _ = app.emit(RIPPLE_EVENT, ());
            }
            if !visible {
                visible = window.show().is_ok();
            }
        }
        std::thread::sleep(POLL_EVERY);
    }
    let _ = window.destroy();
}
