//! The capture overlay: freeze every monitor, show one borderless always-on-top window per
//! monitor (each running `src/overlay/Overlay.tsx` on its own frozen frame), then turn the
//! user's choice into the Capture. Windows-only in practice (the frames come from capture.rs);
//! the geometry (clamping, negative coordinates, cropping) lives in geometry.rs.
//!
//! The overlay windows are created per capture for now; keeping them pre-warmed and hidden
//! (ADR 0003) is ticket 24.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl};

use crate::capture::{self, MonitorFrame};
use crate::capture_image::encode_png;
use crate::diag;
use crate::geometry::{self, MonitorBounds, Region};
use crate::watchdog::{self, Verdict};

const LABEL_PREFIX: &str = "overlay-";
/// Event carrying the new magnifier setting (a bool) to every window: a key press only reaches one
/// overlay, and the Settings checkbox changes it from yet another window. Sent by `set_magnifier`.
pub const MAGNIFIER_EVENT: &str = "overlay-magnifier";

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
    /// Which capture attempt this belongs to (see `OverlayState::attempt`).
    id: u64,
    frames: Vec<Arc<MonitorFrame>>,
    /// Per monitor: the visible windows clipped to it, topmost first. The page hit-tests a copy and
    /// reports an index back, so the rectangle that is cropped always comes from here.
    windows: Vec<Vec<Region>>,
    /// When the screen was read; names the Library file.
    captured_at_ms: f64,
    editor_was_visible: bool,
    /// When the overlay windows started opening; the watchdog's clock.
    opened_at: Instant,
    /// Monitors whose overlay page has reported `overlay_ready`.
    ready: HashSet<usize>,
}

#[derive(Default)]
pub struct OverlayState {
    /// True from the hotkey until the overlay is closed again; a second hotkey press is ignored.
    /// Only `end` clears it, and the watchdog and every error path end through it, so it cannot stay set.
    busy: AtomicBool,
    /// Numbers the capture attempts, so a watchdog or a late thread can tell it is out of date.
    attempt: AtomicU64,
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

/// The one teardown every path ends through (Esc/cancel, a choice, an error, the watchdog): clear
/// `busy` first so it can never stay stuck, close every overlay window and release the session.
fn end(app: &AppHandle) -> Option<Session> {
    let state = app.state::<OverlayState>();
    let session = state.session.lock().unwrap_or_else(|p| p.into_inner()).take();
    state.busy.store(false, Ordering::SeqCst);
    for (name, window) in app.webview_windows() {
        if name.starts_with(LABEL_PREFIX) {
            let _ = window.destroy();
        }
    }
    diag::log(&format!("overlay: torn down (session {})", if session.is_some() { "released" } else { "was already gone" }));
    session
}

fn restore_editor(app: &AppHandle, was_visible: bool) {
    if was_visible {
        crate::show_editor(app);
    }
}

/// Tell the user in a native message box what went wrong and where the log is.
fn show_error(app: &AppHandle, message: &str) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    let location = match diag::path() {
        Some(path) => format!("Details are in the log file:\n{}", path.display()),
        None => "The log file could not be located.".to_string(),
    };
    app.dialog()
        .message(format!("The capture could not start.\n\n{message}\n\n{location}"))
        .title("Screenshot Annotation")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

/// Give up on the capture: log it, tear everything down, put the editor back and tell the user.
fn fail(app: &AppHandle, message: &str) {
    diag::log(&format!("capture failed: {message}"));
    let session = end(app);
    restore_editor(app, session.is_some_and(|s| s.editor_was_visible));
    show_error(app, message);
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
/// and open an overlay on each. Runs on its own thread so the caller returns at once. `source`
/// names the trigger in the log ("hotkey", "tray", "editor button").
pub fn begin(app: AppHandle, source: &str) {
    let source = source.to_string();
    std::thread::spawn(move || {
        diag::log(&format!("capture requested ({source})"));
        let state = app.state::<OverlayState>();
        if state.busy.swap(true, Ordering::SeqCst) {
            diag::log("capture ignored: an earlier capture is still open (the watchdog clears one that never shows)");
            return;
        }
        let attempt = state.attempt.fetch_add(1, Ordering::SeqCst) + 1;
        watch(app.clone(), attempt);
        // A panic must not leave `busy` set.
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run(&app, attempt)));
        if outcome.is_err() {
            fail(&app, "The capture code crashed (a panic).");
        }
    });
}

/// True while `attempt` is still the capture in progress.
fn current(app: &AppHandle, attempt: u64) -> bool {
    let state = app.state::<OverlayState>();
    state.busy.load(Ordering::SeqCst) && state.attempt.load(Ordering::SeqCst) == attempt
}

fn run(app: &AppHandle, attempt: u64) {
    let started = Instant::now();
    let editor_was_visible = match app.get_webview_window(crate::EDITOR_LABEL) {
        Some(win) if win.is_visible().unwrap_or(false) => {
            crate::hide_editor(&win);
            std::thread::sleep(crate::HIDE_SETTLE);
            diag::log("editor was visible: hidden for the capture");
            true
        }
        _ => {
            diag::log("editor was not visible");
            false
        }
    };

    let frames = match capture::grab_monitors() {
        Ok(frames) => frames,
        Err(message) => {
            if current(app, attempt) {
                fail(app, &format!("Reading the screen failed: {message}"));
            }
            return;
        }
    };
    for (i, f) in frames.iter().enumerate() {
        let b = f.bounds;
        diag::log(&format!(
            "monitor {i}: x={} y={} {}x{} px, {} bytes of pixels",
            b.x,
            b.y,
            b.width,
            b.height,
            f.rgba.len()
        ));
    }
    diag::log(&format!("screen frozen in {} ms", started.elapsed().as_millis()));
    let captured_at_ms = now_ms();
    // Read the windows right after the frozen frames, before any overlay window exists, and
    // leave out the overlays regardless (see `overlay_handles`).
    let windows = match capture::list_windows() {
        Ok(facts) => geometry::pickable_rects(&facts, &overlay_handles(app)),
        Err(message) => {
            diag::log(&format!("could not list windows (window mode is off): {message}"));
            Vec::new()
        }
    };
    diag::log(&format!("{} pickable windows listed", windows.len()));
    let frames: Vec<Arc<MonitorFrame>> = frames.into_iter().map(Arc::new).collect();
    let layout: Vec<MonitorBounds> = frames.iter().map(|f| f.bounds).collect();
    let windows = layout.iter().map(|m| geometry::windows_on_monitor(&windows, *m)).collect();
    {
        let state = app.state::<OverlayState>();
        let mut session = state.session.lock().unwrap_or_else(|p| p.into_inner());
        if !current(app, attempt) {
            diag::log("capture abandoned: the watchdog ended it while the screen was being read");
            drop(session);
            restore_editor(app, editor_was_visible);
            return;
        }
        *session = Some(Session {
            id: attempt,
            frames,
            windows,
            captured_at_ms,
            editor_was_visible,
            opened_at: Instant::now(),
            ready: HashSet::new(),
        });
    }

    for (index, bounds) in layout.iter().enumerate() {
        if !current(app, attempt) {
            return;
        }
        match open_window(app, index, bounds) {
            Ok(()) => diag::log(&format!("overlay window {index} opened (hidden until its page reports ready)")),
            Err(e) => {
                fail(app, &format!("Could not open the capture overlay on monitor {index}: {e}"));
                return;
            }
        }
    }
    diag::log("all overlay windows opened; waiting for a page to report ready");
}

/// Watch one capture attempt from its own thread: if no overlay ever reports ready, tear it all
/// down (see watchdog.rs). Ends quietly when the capture finishes or an overlay is up.
fn watch(app: AppHandle, attempt: u64) {
    std::thread::spawn(move || {
        let started = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(100));
            if !current(&app, attempt) {
                return;
            }
            let (ready, since_opened) = {
                let state = app.state::<OverlayState>();
                let session = state.session.lock().unwrap_or_else(|p| p.into_inner());
                match session.as_ref() {
                    Some(s) if s.id == attempt => (s.ready.len(), Some(s.opened_at.elapsed())),
                    _ => (0, None),
                }
            };
            match watchdog::verdict(ready, since_opened, started.elapsed()) {
                Verdict::Wait => {}
                Verdict::Done => return,
                Verdict::GiveUp(why) => {
                    if current(&app, attempt) {
                        fail(&app, &format!("The capture overlay never appeared: {why}."));
                    }
                    return;
                }
            }
        }
    });
}

/// Create the (still hidden) overlay window covering exactly one monitor. It is shown by
/// `overlay_ready` once its frozen frame is decoded, so there is no flash of an empty window.
fn open_window(app: &AppHandle, index: usize, bounds: &MonitorBounds) -> tauri::Result<()> {
    let window = crate::new_window(app, &label(index),WebviewUrl::App(format!("index.html#overlay/{index}").into()))
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

/// Log a command's outcome: its name, the monitor, and how it ended.
fn logged<T>(command: &str, monitor: usize, result: Result<T, String>, ok: impl FnOnce(&T) -> String) -> Result<T, String> {
    match &result {
        Ok(value) => diag::log(&format!("{command}(monitor {monitor}): ok, {}", ok(value))),
        Err(e) => diag::log(&format!("{command}(monitor {monitor}): ERROR {e}")),
    }
    result
}

/// The frozen frame of one monitor, packed with `pack_frame`.
#[tauri::command]
pub async fn overlay_frame(state: tauri::State<'_, OverlayState>, monitor: usize) -> Result<Response, String> {
    let started = Instant::now();
    let result = (|| -> Result<(u32, u32, Vec<u8>), String> {
        let frame = {
            let session = state.session.lock().unwrap_or_else(|p| p.into_inner());
            let session = session.as_ref().ok_or("no capture in progress")?;
            session.frames.get(monitor).cloned().ok_or("no such monitor")?
        };
        let png = encode_png(frame.bounds.width, frame.bounds.height, &frame.rgba)?;
        Ok((frame.bounds.width, frame.bounds.height, png))
    })();
    let (width, height, png) = logged("overlay_frame", monitor, result, |(w, h, png)| {
        format!("{w}x{h}, PNG {} bytes, {} ms", png.len(), started.elapsed().as_millis())
    })?;
    Ok(Response::new(pack_frame(width, height, &png)))
}

/// The windows visible on one monitor, topmost first, for the overlay's hover highlight.
#[tauri::command]
pub async fn overlay_windows(state: tauri::State<'_, OverlayState>, monitor: usize) -> Result<Vec<RectOut>, String> {
    let result = (|| -> Result<Vec<RectOut>, String> {
        let session = state.session.lock().unwrap_or_else(|p| p.into_inner());
        let session = session.as_ref().ok_or("no capture in progress")?;
        let windows = session.windows.get(monitor).ok_or("no such monitor")?;
        Ok(windows.iter().copied().map(RectOut::from).collect())
    })();
    logged("overlay_windows", monitor, result, |list| format!("{} windows", list.len()))
}

/// An overlay has its frame on screen: show it, and give keyboard focus to the one under the
/// mouse pointer (Space and Esc go to the focused window).
#[tauri::command]
pub async fn overlay_ready(app: AppHandle, state: tauri::State<'_, OverlayState>, monitor: usize) -> Result<(), String> {
    let result = (|| -> Result<bool, String> {
        let under_cursor = {
            let mut session = state.session.lock().unwrap_or_else(|p| p.into_inner());
            let session = session.as_mut().ok_or("no capture in progress")?;
            session.ready.insert(monitor);
            let layout: Vec<MonitorBounds> = session.frames.iter().map(|f| f.bounds).collect();
            capture::cursor_position().ok().and_then(|(x, y)| geometry::monitor_at(&layout, x, y))
        };
        let window = app.get_webview_window(&label(monitor)).ok_or("the overlay window is gone")?;
        window.show().map_err(|e| e.to_string())?;
        let focus = under_cursor == Some(monitor);
        if focus {
            let _ = window.set_focus();
        }
        Ok(focus)
    })();
    logged("overlay_ready", monitor, result, |focus| {
        format!("window shown{}", if *focus { " and focused" } else { "" })
    })
    .map(|_| ())
}

/// The overlay page reports a line (and, with `fatal`, a failure that ends the capture).
#[tauri::command]
pub fn overlay_log(app: AppHandle, message: String, fatal: Option<bool>) {
    diag::log(&format!("page: {message}"));
    if fatal.unwrap_or(false) && app.state::<OverlayState>().busy.load(Ordering::SeqCst) {
        fail(&app, &format!("The capture overlay page failed: {message}"));
    }
}

fn kind(outcome: &Outcome) -> &'static str {
    match outcome {
        Outcome::Region { .. } => "region",
        Outcome::Window { .. } => "window",
        Outcome::Monitor => "monitor",
        Outcome::Cancel => "cancel",
    }
}

/// The user chose: close every overlay and turn the choice into the Capture, or restore the
/// editor on cancel.
#[tauri::command]
pub async fn overlay_finish(app: AppHandle, outcome: Outcome) -> Result<(), String> {
    let kind = kind(&outcome);
    let Some(session) = end(&app) else {
        diag::log(&format!("overlay_finish({kind}): ignored, no capture in progress"));
        return Ok(());
    };
    let editor_was_visible = session.editor_was_visible;
    match deliver(&app, session, outcome) {
        Ok(true) => diag::log(&format!("overlay_finish({kind}): capture delivered to the editor")),
        Ok(false) => {
            diag::log(&format!("overlay_finish({kind}): nothing captured, editor restored if it was open"));
            restore_editor(&app, editor_was_visible);
        }
        Err(e) => {
            diag::log(&format!("overlay_finish({kind}): ERROR {e}"));
            restore_editor(&app, editor_was_visible);
            show_error(&app, &format!("The selection could not be turned into a capture: {e}"));
            return Err(e);
        }
    }
    Ok(())
}

/// Crop the chosen part of the frozen frame and hand it to the editor. `Ok(false)`: nothing chosen.
fn deliver(app: &AppHandle, session: Session, outcome: Outcome) -> Result<bool, String> {
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
        Outcome::Window { monitor, window } => {
            session.windows.get(monitor).and_then(|list| list.get(window)).map(|r| (monitor, *r))
        }
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
        return Ok(false);
    };

    let frame = &session.frames[monitor];
    let cropped = geometry::crop_rgba(&frame.rgba, frame.bounds.width, frame.bounds.height, region)
        .ok_or("could not crop the frozen frame")?;
    let png = encode_png(region.width, region.height, &cropped)?;
    crate::deliver_capture(app, region.width, region.height, session.captured_at_ms, &png);
    Ok(true)
}
