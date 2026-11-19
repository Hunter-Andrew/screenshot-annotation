//! Drawing mode (tickets 41 and 52, ADR 0009): one transparent, always-on-top overlay window per monitor
//! that takes the mouse and draws with the editor's saved styles (`src/drawing/DrawingOverlay.tsx`).
//! Started and ended by the Drawing mode hotkey or the tray item "Draw on screen" (`toggle`), and ended
//! by Esc on any overlay (`drawing_exit`) or by a capture (`end_for_capture`).
//!
//! The windows are created when the mode starts and destroyed when it ends: they are NOT pre-warmed
//! (ADR 0003 covers the capture overlay and the editor only), so nothing of this feature exists while
//! the mode is off. Placement follows overlay.rs: one window per monitor in physical coordinates, the
//! position set before the size so the size is applied at the target monitor's DPI. Drawing is in the
//! pages, which hold the drawings; destroying a window throws its drawings away, and nothing is saved.
//! The overlays are not excluded from screen captures (a Capture includes the drawings, ticket 41
//! decision 8). What the hotkey does, and the window names, are decided in drawing_plan.rs (pure, tested).

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl};

use crate::capture;
use crate::diag;
use crate::drawing_plan::{self, Toggle};
use crate::geometry::{self, MonitorBounds};

#[derive(Default)]
pub struct DrawingState {
    /// True from the moment the mode starts until `end`; only `start` and `end` change it.
    active: AtomicBool,
}

/// The tray's "Draw on screen" item, kept so its label can follow a changed Drawing mode hotkey.
pub struct TrayItem(pub tauri::menu::MenuItem<tauri::Wry>);

/// Hotkey / tray entry point: start the mode, or end it if it is on. Runs on a thread of its own, so
/// the caller (the global-shortcut handler or the tray menu, both on the main thread) returns at once
/// and window creation can block there (see `on_worker_thread` in lib.rs). `source` names the trigger
/// in the log.
pub fn toggle(app: AppHandle, source: &str) {
    let source = source.to_string();
    std::thread::spawn(move || {
        let active = app.state::<DrawingState>().active.load(Ordering::SeqCst);
        let decision = drawing_plan::toggle(active, crate::overlay::capture_in_progress(&app));
        diag::log(&format!("drawing mode requested ({source}): {decision:?}"));
        match decision {
            Toggle::Start => start(&app),
            Toggle::End => end(&app, "toggled"),
            Toggle::Ignore => {}
        }
    });
}

/// Put monitor `index`'s drawing window exactly over its monitor, creating it first if it does not
/// exist. Physical coordinates (x and y are negative for monitors left of or above the primary); the
/// position is set before the size so the size is applied at the target monitor's DPI. The window is
/// created hidden and shown by `start` once every monitor has one. Call from a worker thread.
fn place_window(app: &AppHandle, index: usize, bounds: &MonitorBounds) -> Result<tauri::WebviewWindow, String> {
    let label = drawing_plan::label(index);
    let make = || {
        crate::new_window(app, &label, WebviewUrl::App(format!("index.html#drawing/{index}").into()))
            .title("Drawing")
            .decorations(false)
            .resizable(false)
            .shadow(false)
            .transparent(true)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible(false)
            .build()
    };
    let (window, _created) =
        crate::create_or_existing(app, &label, make).ok_or("the window could not be created (see the log)")?;
    window.set_position(PhysicalPosition::new(bounds.x, bounds.y)).map_err(|e| e.to_string())?;
    window.set_size(PhysicalSize::new(bounds.width, bounds.height)).map_err(|e| e.to_string())?;
    Ok(window)
}

/// Create an overlay on every monitor, show them, and give keyboard focus to the one under the mouse
/// pointer (the in-window keys only work while an overlay has focus; a click on another monitor's
/// overlay focuses that one).
fn start(app: &AppHandle) {
    let state = app.state::<DrawingState>();
    if state.active.swap(true, Ordering::SeqCst) {
        return;
    }
    let monitors = match app.available_monitors() {
        Ok(monitors) if !monitors.is_empty() => monitors,
        other => {
            diag::log(&format!("drawing mode not started: no monitors found ({other:?})"));
            state.active.store(false, Ordering::SeqCst);
            return;
        }
    };
    let layout: Vec<MonitorBounds> = monitors
        .iter()
        .map(|m| MonitorBounds { x: m.position().x, y: m.position().y, width: m.size().width, height: m.size().height })
        .collect();
    let mut windows = Vec::new();
    for (index, bounds) in layout.iter().enumerate() {
        match place_window(app, index, bounds) {
            Ok(window) => windows.push(window),
            Err(e) => {
                diag::log(&format!("drawing mode not started: overlay {index}: {e}"));
                end(app, "an overlay window could not be opened");
                return;
            }
        }
    }
    // Esc or a capture may have ended the mode while the windows were being made: they are gone already.
    if !state.active.load(Ordering::SeqCst) {
        end(app, "ended while starting");
        return;
    }
    let under_cursor = capture::cursor_position()
        .ok()
        .and_then(|(x, y)| geometry::monitor_at(&layout, x, y))
        .unwrap_or(0);
    for (index, window) in windows.iter().enumerate() {
        let _ = window.show();
        if index == under_cursor {
            let _ = window.set_focus();
        }
    }
    diag::log(&format!("drawing mode started: {} overlay window(s), focus on monitor {under_cursor}", windows.len()));
}

/// Leave the mode: destroy every overlay window, which throws the drawings away. Safe to call when the
/// mode is already off.
pub fn end(app: &AppHandle, why: &str) {
    let was_active = app.state::<DrawingState>().active.swap(false, Ordering::SeqCst);
    for (name, window) in app.webview_windows() {
        if drawing_plan::is_label(&name) {
            let _ = window.destroy();
        }
    }
    diag::log(&format!("drawing mode ended ({why}); it was {}", if was_active { "on" } else { "already off" }));
}

/// A capture has read the screen, drawings included: the mode ends and the drawings clear (ticket 41
/// decision 8). Called by overlay.rs right after the frozen frames are taken.
pub fn end_for_capture(app: &AppHandle) {
    if app.state::<DrawingState>().active.load(Ordering::SeqCst) {
        end(app, "a capture started, drawings included in its picture");
    }
}

/// Esc on a drawing overlay: leave the mode (the other monitors' overlays go too).
#[tauri::command]
pub async fn drawing_exit(app: AppHandle) {
    end(&app, "Esc");
}

/// The Drawing mode hotkey changed: show the new one in the tray item's label.
pub fn update_tray_label(app: &AppHandle, accelerator: &str) {
    if let Some(item) = app.try_state::<TrayItem>() {
        if let Err(e) = item.0.set_text(crate::tray_menu::draw_label(accelerator)) {
            diag::log(&format!("tray item \"Draw on screen\": could not update its label: {e}"));
        }
    }
}
