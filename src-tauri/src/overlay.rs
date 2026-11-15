//! The capture overlay: freeze every monitor, show one borderless always-on-top window per
//! monitor (each running `src/overlay/Overlay.tsx` on its own frozen frame), then turn the
//! user's choice into the Capture. Windows-only in practice (the frames come from capture.rs);
//! the geometry (clamping, negative coordinates, cropping) lives in geometry.rs.
//!
//! The overlay windows are created per capture for now; keeping them pre-warmed and hidden
//! (ADR 0003) is ticket 24.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

use crate::capture::{self, MonitorFrame};
use crate::capture_image::encode_png;
use crate::geometry::{self, MonitorBounds, Region};

const LABEL_PREFIX: &str = "overlay-";
/// Event telling every overlay to toggle its magnifier (a key press only reaches one window).
const MAGNIFIER_EVENT: &str = "overlay-magnifier";

/// What the overlay page reports; mirrors `OverlayOutcome` in `src/platform/bridge.ts`.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Outcome {
    Region { monitor: usize, region: RegionArg },
    /// A click on a highlighted window; `window` indexes that monitor's list from `overlay_windows`.
    Window { monitor: usize, window: usize },
    Monitor,
    Cancel,
}

#[derive(Deserialize)]
pub struct RegionArg {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

/// A rectangle sent to the overlay page (`OverlayRect` in `src/platform/bridge.ts`).
#[derive(Serialize)]
pub struct RectOut {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

impl From<Region> for RectOut {
    fn from(r: Region) -> Self {
        RectOut { x: r.x, y: r.y, width: r.width, height: r.height }
    }
}

struct Session {
    frames: Vec<Arc<MonitorFrame>>,
    /// Per monitor: the visible windows clipped to it, topmost first. The page hit-tests a copy and
    /// reports an index back, so the rectangle that is cropped always comes from here.
    windows: Vec<Vec<Region>>,
    /// When the screen was read; names the Library file.
    captured_at_ms: f64,
    editor_was_visible: bool,
}

#[derive(Default)]
pub struct OverlayState {
    /// True from the hotkey until the overlay is closed again; a second hotkey press is ignored.
    busy: AtomicBool,
    session: Mutex<Option<Session>>,
}

/// `overlay_frame` wire format: u32 LE width, u32 LE height, then the PNG. `src/platform/tauriBridge.ts`
/// decodes it.
fn pack_frame(width: u32, height: u32, png: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + png.len());
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(png);
    out
}

fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

fn label(monitor: usize) -> String {
    format!("{LABEL_PREFIX}{monitor}")
}

/// Close every overlay window and release the session.
fn end(app: &AppHandle) -> Option<Session> {
    for (name, window) in app.webview_windows() {
        if name.starts_with(LABEL_PREFIX) {
            let _ = window.destroy();
        }
    }
    let state = app.state::<OverlayState>();
    let session = state.session.lock().unwrap().take();
    state.busy.store(false, Ordering::SeqCst);
    session
}

fn restore_editor(app: &AppHandle, was_visible: bool) {
    if was_visible {
        crate::show_editor(app);
    }
}

/// Native handles of the overlay windows, so window enumeration can never offer them as targets.
#[cfg(windows)]
fn overlay_handles(app: &AppHandle) -> Vec<isize> {
    app.webview_windows()
        .into_iter()
        .filter(|(name, _)| name.starts_with(LABEL_PREFIX))
        .filter_map(|(_, window)| window.hwnd().ok().map(|h| h.0 as isize))
        .collect()
}

#[cfg(not(windows))]
fn overlay_handles(_app: &AppHandle) -> Vec<isize> {
    Vec::new()
}

/// Hotkey / tray entry point: hide the editor (so it is not in the picture), freeze all monitors
/// and open an overlay on each. Runs on its own thread so the caller returns at once.
pub fn begin(app: AppHandle) {
    std::thread::spawn(move || {
        if app.state::<OverlayState>().busy.swap(true, Ordering::SeqCst) {
            return; // an overlay is already open
        }
        let editor_was_visible = match app.get_webview_window(crate::EDITOR_LABEL) {
            Some(win) if win.is_visible().unwrap_or(false) => {
                let _ = win.hide();
                std::thread::sleep(crate::HIDE_SETTLE);
                true
            }
            _ => false,
        };

        let frames = match capture::grab_monitors() {
            Ok(frames) => frames,
            Err(message) => {
                eprintln!("capture failed: {message}");
                app.state::<OverlayState>().busy.store(false, Ordering::SeqCst);
                restore_editor(&app, editor_was_visible);
                return;
            }
        };
        let captured_at_ms = now_ms();
        // Read the windows right after the frozen frames, before any overlay window exists, and
        // leave out the overlays regardless (see `overlay_handles`).
        let windows = match capture::list_windows() {
            Ok(facts) => geometry::pickable_rects(&facts, &overlay_handles(&app)),
            Err(message) => {
                eprintln!("could not list windows (window mode is off): {message}");
                Vec::new()
            }
        };
        let frames: Vec<Arc<MonitorFrame>> = frames.into_iter().map(Arc::new).collect();
        let layout: Vec<MonitorBounds> = frames.iter().map(|f| f.bounds).collect();
        let windows = layout.iter().map(|m| geometry::windows_on_monitor(&windows, *m)).collect();
        *app.state::<OverlayState>().session.lock().unwrap() =
            Some(Session { frames, windows, captured_at_ms, editor_was_visible });

        for (index, bounds) in layout.iter().enumerate() {
            if let Err(e) = open_window(&app, index, bounds) {
                eprintln!("could not open the overlay on monitor {index}: {e}");
                end(&app);
                restore_editor(&app, editor_was_visible);
                return;
            }
        }
    });
}

/// Create the (still hidden) overlay window covering exactly one monitor. It is shown by
/// `overlay_ready` once its frozen frame is decoded, so there is no flash of an empty window.
fn open_window(app: &AppHandle, index: usize, bounds: &MonitorBounds) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, label(index), WebviewUrl::App(format!("index.html#overlay/{index}").into()))
        .title("Capture")
        .decorations(false)
        .resizable(false)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .build()?;
    // Physical coordinates: x and y are negative for monitors left of or above the primary. The
    // position is set before the size so the size is applied at the target monitor's DPI.
    window.set_position(PhysicalPosition::new(bounds.x, bounds.y))?;
    window.set_size(PhysicalSize::new(bounds.width, bounds.height))?;
    Ok(())
}

/// The frozen frame of one monitor, packed with `pack_frame`.
#[tauri::command]
pub async fn overlay_frame(state: tauri::State<'_, OverlayState>, monitor: usize) -> Result<Response, String> {
    let frame = {
        let session = state.session.lock().unwrap();
        let session = session.as_ref().ok_or("no capture in progress")?;
        session.frames.get(monitor).cloned().ok_or("no such monitor")?
    };
    let png = encode_png(frame.bounds.width, frame.bounds.height, &frame.rgba)?;
    Ok(Response::new(pack_frame(frame.bounds.width, frame.bounds.height, &png)))
}

/// The windows visible on one monitor, topmost first, for the overlay's hover highlight.
#[tauri::command]
pub async fn overlay_windows(state: tauri::State<'_, OverlayState>, monitor: usize) -> Result<Vec<RectOut>, String> {
    let session = state.session.lock().unwrap();
    let session = session.as_ref().ok_or("no capture in progress")?;
    let windows = session.windows.get(monitor).ok_or("no such monitor")?;
    Ok(windows.iter().copied().map(RectOut::from).collect())
}

/// An overlay has its frame on screen: show it, and give keyboard focus to the one under the
/// mouse pointer (Space and Esc go to the focused window).
#[tauri::command]
pub async fn overlay_ready(app: AppHandle, state: tauri::State<'_, OverlayState>, monitor: usize) -> Result<(), String> {
    let under_cursor = {
        let session = state.session.lock().unwrap();
        let session = session.as_ref().ok_or("no capture in progress")?;
        let layout: Vec<MonitorBounds> = session.frames.iter().map(|f| f.bounds).collect();
        capture::cursor_position().ok().and_then(|(x, y)| geometry::monitor_at(&layout, x, y))
    };
    if let Some(window) = app.get_webview_window(&label(monitor)) {
        window.show().map_err(|e| e.to_string())?;
        if under_cursor == Some(monitor) {
            let _ = window.set_focus();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn overlay_toggle_magnifier(app: AppHandle) {
    let _ = app.emit(MAGNIFIER_EVENT, ());
}

/// The user chose: close every overlay and turn the choice into the Capture, or restore the
/// editor on cancel.
#[tauri::command]
pub async fn overlay_finish(app: AppHandle, outcome: Outcome) -> Result<(), String> {
    let Some(session) = end(&app) else { return Ok(()) };

    let chosen = match outcome {
        Outcome::Cancel => None,
        Outcome::Monitor => {
            let layout: Vec<MonitorBounds> = session.frames.iter().map(|f| f.bounds).collect();
            let (x, y) = capture::cursor_position()?;
            geometry::monitor_at(&layout, x, y).map(|index| {
                let b = session.frames[index].bounds;
                (index, Region { x: 0, y: 0, width: b.width, height: b.height })
            })
        }
        Outcome::Window { monitor, window } => session
            .windows
            .get(monitor)
            .and_then(|list| list.get(window))
            .map(|r| (monitor, *r)),
        Outcome::Region { monitor, region } => {
            let region = Region { x: region.x, y: region.y, width: region.width, height: region.height };
            session
                .frames
                .get(monitor)
                .and_then(|f| geometry::clamp_region(region, f.bounds.width, f.bounds.height))
                .map(|r| (monitor, r))
        }
    };
    let Some((monitor, region)) = chosen else {
        restore_editor(&app, session.editor_was_visible);
        return Ok(());
    };

    let frame = &session.frames[monitor];
    let cropped = geometry::crop_rgba(&frame.rgba, frame.bounds.width, frame.bounds.height, region)
        .ok_or("could not crop the frozen frame")?;
    let png = encode_png(region.width, region.height, &cropped)?;
    crate::deliver_capture(&app, region.width, region.height, session.captured_at_ms, &png);
    Ok(())
}
