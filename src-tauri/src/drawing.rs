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
//!
//! The toolbar (ticket 53) is one more small window, `drawing-toolbar`: always on top, never focusable (so a
//! click on it leaves the keyboard with the overlay that has it), excluded from captures with
//! `pointer_highlight::exclude_from_capture`, created with the overlays and destroyed with them. The pages talk
//! through events: the platform remembers the tool for the app session (`get_drawing_tool` and
//! `set_drawing_tool`, which tells every window), "Use apps" is `set_drawing_click_through`, and the toolbar
//! asks for its collapsed and expanded size with `resize_drawing_toolbar`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl};

use crate::capture;
use crate::diag;
use crate::drawing_plan::{self, Toggle};
use crate::geometry::{self, MonitorBounds};

#[derive(Default)]
pub struct DrawingState {
    /// True from the moment the mode starts until `end`; only `start` and `end` change it.
    active: AtomicBool,
    /// The tool last chosen, kept for the app session so the next start of the mode opens on it. Empty (the
    /// default) until one is chosen, which reads as Arrow.
    tool: Mutex<String>,
}

/// Event carrying the chosen tool (its name, a string) to every window after `set_drawing_tool`.
pub const TOOL_EVENT: &str = "drawing-tool";

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
        // An overlay that takes focus (a click on it) comes to the top of the always-on-top windows, over the
        // toolbar: put the toolbar back on top.
        let handle = app.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(true) = event {
                raise_toolbar(&handle);
            }
        });
    }
    // The toolbar opens last: it is shown without taking focus, so the overlay under the mouse keeps the keys.
    match layout.get(under_cursor) {
        Some(bounds) => {
            let scale = monitors.get(under_cursor).map_or(1.0, |m| m.scale_factor());
            if let Err(e) = open_toolbar(app, bounds, scale) {
                // The drawing still works without it (the keys and the hotkey are there): say so and carry on.
                diag::log(&format!("drawing mode: the toolbar could not be opened: {e}"));
            }
        }
        None => diag::log("drawing mode: no monitor for the toolbar"),
    }
    // Esc or a capture may have ended the mode while the toolbar was being made: it is a window of its own.
    if !state.active.load(Ordering::SeqCst) {
        end(app, "ended while starting");
        return;
    }
    diag::log(&format!("drawing mode started: {} overlay window(s), focus on monitor {under_cursor}", windows.len()));
}

/// Open the toolbar top-centre on the monitor with `bounds` (physical pixels, scale factor `scale`), hidden from
/// captures. Not focusable and not focused, so showing it never takes the keyboard from the overlay. The
/// position is set before the size so the size is applied at that monitor's DPI (as in `place_window`).
/// Call from a worker thread.
fn open_toolbar(app: &AppHandle, bounds: &MonitorBounds, scale: f64) -> Result<(), String> {
    let make = || {
        crate::new_window(app, drawing_plan::TOOLBAR_LABEL, WebviewUrl::App("index.html#drawing-toolbar".into()))
            .title("Drawing toolbar")
            .decorations(false)
            .resizable(false)
            .shadow(false)
            .transparent(true)
            .skip_taskbar(true)
            .always_on_top(true)
            .focused(false)
            .focusable(false)
            .visible(false)
            .build()
    };
    let (window, _created) = crate::create_or_existing(app, drawing_plan::TOOLBAR_LABEL, make)
        .ok_or("the window could not be created (see the log)")?;
    let place = drawing_plan::toolbar_placement((bounds.x, bounds.y, bounds.width, bounds.height), scale);
    window.set_position(PhysicalPosition::new(place.x, place.y)).map_err(|e| e.to_string())?;
    window.set_size(PhysicalSize::new(place.width, place.height)).map_err(|e| e.to_string())?;
    crate::pointer_highlight::exclude_from_capture(&window, "drawing toolbar");
    window.show().map_err(|e| e.to_string())
}

/// Put the toolbar back above the overlays. The window layer ignores a repeated "always on top", so it is
/// dropped and set again.
fn raise_toolbar(app: &AppHandle) {
    if let Some(toolbar) = app.get_webview_window(drawing_plan::TOOLBAR_LABEL) {
        let _ = toolbar.set_always_on_top(false);
        let _ = toolbar.set_always_on_top(true);
    }
}

/// Leave the mode: destroy every overlay window and the toolbar, which throws the drawings away. Safe to call when the
/// mode is already off.
pub fn end(app: &AppHandle, why: &str) {
    let was_active = app.state::<DrawingState>().active.swap(false, Ordering::SeqCst);
    for (name, window) in app.webview_windows() {
        if drawing_plan::is_window(&name) {
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

/// The tool the mode opens on: the last one chosen in this app session, Arrow before any.
#[tauri::command]
pub async fn get_drawing_tool(app: AppHandle) -> String {
    let state = app.state::<DrawingState>();
    let tool = state.tool.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if drawing_plan::is_tool(&tool) {
        tool
    } else {
        drawing_plan::DEFAULT_TOOL.to_string()
    }
}

/// A tool was chosen on the toolbar or by a key of an overlay: remember it and tell every window.
#[tauri::command]
pub async fn set_drawing_tool(app: AppHandle, tool: String) {
    if !drawing_plan::is_tool(&tool) {
        diag::log(&format!("drawing mode: ignored an unknown tool {tool:?}"));
        return;
    }
    {
        let state = app.state::<DrawingState>();
        let mut slot = state.tool.lock().unwrap_or_else(|p| p.into_inner());
        *slot = tool.clone();
    }
    let _ = app.emit(TOOL_EVENT, tool);
}

/// The toolbar's "Use apps": every overlay lets the mouse through (`on`) or takes it back. The drawings stay
/// painted either way, they are only the page's canvas.
#[tauri::command]
pub async fn set_drawing_click_through(app: AppHandle, on: bool) {
    for (name, window) in app.webview_windows() {
        if drawing_plan::is_label(&name) {
            if let Err(e) = window.set_ignore_cursor_events(on) {
                diag::log(&format!("drawing mode: {name}: could not set click-through to {on}: {e}"));
            }
        }
    }
    diag::log(&format!("drawing mode: overlays are {}", if on { "click-through (Use apps)" } else { "taking the mouse" }));
    if !on {
        // After "Use apps" the keyboard is in the app that was used: bring it back to an overlay, so the keys
        // (A, R, P, H, Ctrl+Z, Esc) work without a first click, as they do when the mode starts.
        focus_overlay(&app);
    }
}

/// Give keyboard focus to the drawing overlay on the monitor under the pointer, or the first overlay when that
/// one cannot be told. Mirrors how `start` focuses an overlay.
fn focus_overlay(app: &AppHandle) {
    let layout: Vec<MonitorBounds> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| MonitorBounds { x: m.position().x, y: m.position().y, width: m.size().width, height: m.size().height })
        .collect();
    let windows = app.webview_windows();
    let under = capture::cursor_position().ok().and_then(|(x, y)| geometry::monitor_at(&layout, x, y));
    let target = under
        .and_then(|i| windows.get(&drawing_plan::label(i)))
        .or_else(|| (0..layout.len()).find_map(|i| windows.get(&drawing_plan::label(i))));
    match target {
        Some(window) => {
            if let Err(e) = window.set_focus() {
                diag::log(&format!("drawing mode: could not give an overlay the keyboard: {e}"));
            }
        }
        None => diag::log("drawing mode: no overlay to give the keyboard to"),
    }
}

/// The toolbar collapses to a small pill or expands again: resize its window (CSS pixels, so the monitor it is
/// on decides the pixels). Its top-left corner stays where it is.
#[tauri::command]
pub async fn resize_drawing_toolbar(app: AppHandle, width: f64, height: f64) {
    let Some((width, height)) = drawing_plan::toolbar_request(width, height) else {
        diag::log(&format!("drawing mode: ignored a toolbar size of {width} x {height}"));
        return;
    };
    if let Some(toolbar) = app.get_webview_window(drawing_plan::TOOLBAR_LABEL) {
        if let Err(e) = toolbar.set_size(LogicalSize::new(width, height)) {
            diag::log(&format!("drawing mode: the toolbar could not be resized: {e}"));
        }
    }
}

/// The Drawing mode hotkey changed: show the new one in the tray item's label.
pub fn update_tray_label(app: &AppHandle, accelerator: &str) {
    if let Some(item) = app.try_state::<TrayItem>() {
        if let Err(e) = item.0.set_text(crate::tray_menu::draw_label(accelerator)) {
            diag::log(&format!("tray item \"Draw on screen\": could not update its label: {e}"));
        }
    }
}
