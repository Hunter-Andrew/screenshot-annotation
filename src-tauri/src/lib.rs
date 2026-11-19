mod autostart;
mod capture;
mod capture_image;
mod capture_wire;
mod countdown;
mod delay;
mod diag;
mod drawing;
mod drawing_plan;
mod editor_window;
mod geometry;
mod history_store;
mod hotkey;
mod laser_pointer;
mod laser_pointer_math;
mod library;
mod library_index;
mod overlay;
mod png_guard;
mod print_screen;
mod print_screen_key;
mod raw_input;
mod settings;
mod system_cursor;
mod url_guard;
mod watchdog;
mod thumbnail;
mod tray_menu;
mod warm;
mod window_open;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    ipc::{InvokeBody, Request, Response},
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use capture_wire::{pack_capture, ClipboardOutcome};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const SETTINGS_LABEL: &str = "settings";
const EDITOR_LABEL: &str = "editor";
/// Event telling the editor a Capture is waiting; it then calls `take_capture`.
const CAPTURE_READY_EVENT: &str = "capture-ready";
/// Event telling every window that the sticky tool styles were reset.
const TOOL_STYLES_RESET_EVENT: &str = "tool-styles-reset";
/// The short settle after a window (the minimized editor, the countdown badge) steps out of the way, before the
/// screen is read; see `delay::wait_after_minimizing_editor`.
const HIDE_SETTLE: Duration = Duration::from_millis(150);

/// The settings file's folder and its in-memory copy (see `settings.rs`).
struct AppSettings {
    dir: std::path::PathBuf,
    data: Mutex<settings::Settings>,
}

/// `hotkey::ShortcutRegistry` over the global-shortcut plugin (RegisterHotKey on Windows).
struct PluginRegistry<'a>(&'a AppHandle);

impl hotkey::ShortcutRegistry for PluginRegistry<'_> {
    fn register(&self, accelerator: &str) -> Result<(), hotkey::RegisterError> {
        let shortcut: Shortcut = accelerator.parse().map_err(|e| {
            diag::log(&format!("hotkey register {accelerator}: not a valid accelerator: {e}"));
            hotkey::RegisterError::Invalid
        })?;
        // Any failure is reported to the page as "conflict" (hotkey.rs); the real error goes to the log.
        match self.0.global_shortcut().register(shortcut) {
            Ok(()) => {
                diag::log(&format!(
                    "hotkey register {accelerator} (parsed as {}, id {:#x}): ok. RegisterHotKey says ok even when Windows gives Print Screen to Snipping Tool",
                    shortcut.into_string(),
                    shortcut.id()
                ));
                Ok(())
            }
            Err(e) => {
                diag::log(&format!("hotkey register {accelerator} (parsed as {}): failed: {e}", shortcut.into_string()));
                Err(hotkey::RegisterError::Taken)
            }
        }
    }
    fn unregister(&self, accelerator: &str) {
        if let Ok(shortcut) = accelerator.parse::<Shortcut>() {
            match self.0.global_shortcut().unregister(shortcut) {
                Ok(()) => diag::log(&format!("hotkey unregister {accelerator}: ok")),
                Err(e) => diag::log(&format!("hotkey unregister {accelerator}: failed: {e}")),
            }
        }
    }
    fn is_registered(&self, accelerator: &str) -> bool {
        accelerator
            .parse::<Shortcut>()
            .is_ok_and(|shortcut| self.0.global_shortcut().is_registered(shortcut))
    }
}

/// The three global hotkeys the plugin handler tells apart, parsed, so it can tell which one fired without
/// taking the settings lock (a command holds that lock while it registers, and the handler runs on the
/// event loop). Slots: `LASER_POINTER_SLOT`, `DRAWING_MODE_SLOT` and `CAPTURE_SLOT`. A slot is updated
/// after its new hotkey is registered and saved, so a press of a hotkey that is registered but not yet in
/// its slot matches nothing and the handler ignores it (it must never fall through to a capture). Held only
/// for a copy, never while registering.
#[derive(Default)]
struct DemoShortcuts(Mutex<[Option<Shortcut>; 3]>);

const LASER_POINTER_SLOT: usize = 0;
const DRAWING_MODE_SLOT: usize = 1;
const CAPTURE_SLOT: usize = 2;

impl DemoShortcuts {
    fn set(&self, index: usize, accelerator: &str) {
        self.0.lock().unwrap_or_else(|p| p.into_inner())[index] = accelerator.parse::<Shortcut>().ok();
    }
    /// Which slot `shortcut` is in, if any.
    fn which(&self, shortcut: &Shortcut) -> Option<usize> {
        let held = *self.0.lock().unwrap_or_else(|p| p.into_inner());
        held.iter().position(|s| s.as_ref() == Some(shortcut))
    }
}

/// The Print Screen Raw Input listener (ticket 26, ADR 0007) and whether bare Print Screen is on
/// the RegisterHotKey fallback because the listener could not start.
#[derive(Default)]
struct RawInput {
    listener: Mutex<Option<raw_input::Listener>>,
    degraded: AtomicBool,
}

/// `hotkey::ShortcutRegistry` for bare Print Screen over the Raw Input listener. Registering starts
/// the listener (a capture per press, same entry as the other hotkeys, so the `busy` guard in
/// `overlay::begin` applies); unregistering stops it.
struct ListenerRegistry<'a>(&'a AppHandle);

impl hotkey::ShortcutRegistry for ListenerRegistry<'_> {
    fn register(&self, accelerator: &str) -> Result<(), hotkey::RegisterError> {
        let state = self.0.state::<RawInput>();
        let mut slot = state.listener.lock().unwrap_or_else(|p| p.into_inner());
        if slot.is_some() {
            return Ok(());
        }
        let app = self.0.clone();
        let on_trigger: raw_input::OnTrigger = Arc::new(move || {
            diag::log("hotkey event: PrintScreen (raw input) -> capture");
            capture_async(app.clone(), "hotkey");
        });
        match raw_input::Listener::start(on_trigger) {
            Ok(listener) => {
                *slot = Some(listener);
                diag::log(&format!("hotkey register {accelerator}: ok via the Raw Input listener (RegisterHotKey is not used for it)"));
                Ok(())
            }
            Err(e) => {
                diag::log(&format!("hotkey register {accelerator}: Raw Input listener failed: {e}"));
                Err(hotkey::RegisterError::Taken)
            }
        }
    }
    fn unregister(&self, accelerator: &str) {
        let listener = self.0.state::<RawInput>().listener.lock().unwrap_or_else(|p| p.into_inner()).take();
        if let Some(listener) = listener {
            listener.stop();
            diag::log(&format!("hotkey unregister {accelerator}: Raw Input listener stopped"));
        }
    }
    fn is_registered(&self, _accelerator: &str) -> bool {
        self.0.state::<RawInput>().listener.lock().unwrap_or_else(|p| p.into_inner()).is_some()
    }
}

/// Every hotkey operation goes through this: bare Print Screen to the listener, the rest to the plugin.
fn registry(app: &AppHandle) -> hotkey::Routed<'_, PluginRegistry<'_>, ListenerRegistry<'_>> {
    hotkey::Routed {
        plugin: PluginRegistry(app),
        listener: ListenerRegistry(app),
        degraded: &app.state::<RawInput>().inner().degraded,
        log: diag::log,
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HotkeyState {
    accelerator: String,
    registered: bool,
    /// Bare Print Screen only: the Raw Input listener could not start (see capture.log), so the
    /// app fell back to RegisterHotKey, which may never fire for that key.
    raw_input_failed: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoHotkeys {
    laser_pointer: String,
    drawing_mode: String,
    laser_pointer_registered: bool,
    drawing_mode_registered: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PrintScreenNotice {
    snipping_enabled: bool,
    dismissed: bool,
}

/// A Capture waiting for the editor to pick it up, in the wire format of `take_capture`.
#[derive(Default)]
struct PendingCapture(Mutex<Option<Vec<u8>>>);

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Opens a URL in the default browser. Only the GitHub Releases page is allowed (ADR 0006).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url_guard::is_allowed(&url) {
        return Err("URL not allowed".into());
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// The capture hotkey and whether the OS accepted it (false: another app has it).
#[tauri::command]
fn get_hotkey(app: AppHandle, state: tauri::State<'_, AppSettings>) -> HotkeyState {
    use hotkey::ShortcutRegistry;
    let accelerator = state.data.lock().unwrap().hotkey.clone();
    let registered = registry(&app).is_registered(&accelerator);
    let raw_input_failed =
        print_screen_key::is_bare_print_screen(&accelerator) && app.state::<RawInput>().degraded.load(Ordering::SeqCst);
    diag::log(&format!(
        "get_hotkey: {accelerator}, registered by this app: {registered}, raw input listener failed: {raw_input_failed}"
    ));
    HotkeyState { accelerator, registered, raw_input_failed }
}

/// Re-registers the capture hotkey and saves it. Errors: "conflict" (another app owns it; the old
/// hotkey stays), "invalid", "failed" (could not save; the old hotkey stays).
#[tauri::command]
fn set_hotkey(
    app: AppHandle,
    state: tauri::State<'_, AppSettings>,
    demo: tauri::State<'_, DemoShortcuts>,
    accelerator: String,
) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let old = data.hotkey.clone();
    diag::log(&format!("set_hotkey: requested {accelerator} (current {old})"));
    if hotkey::clashes_with_demo(&accelerator, &data.laser_pointer_hotkey, &data.drawing_mode_hotkey) {
        diag::log(&format!("set_hotkey: {accelerator} refused (a demo-tool hotkey uses it); {old} stays in force"));
        return Err("demo-hotkey".to_string());
    }
    let mut next = data.clone();
    next.hotkey = accelerator.clone();
    let outcome = hotkey::change_hotkey(&registry(&app), &old, &accelerator, || {
        settings::save(&state.dir, &next).inspect_err(|e| diag::log(&format!("set_hotkey: could not save settings.json: {e}")))
    });
    match outcome {
        Ok(()) => {
            diag::log(&format!("set_hotkey: {accelerator} is now the capture hotkey (saved)"));
            demo.set(CAPTURE_SLOT, &accelerator);
            data.hotkey = accelerator;
            Ok(())
        }
        Err(code) => {
            diag::log(&format!("set_hotkey: {accelerator} refused ({code}); {old} stays in force"));
            Err(code.to_string())
        }
    }
}

/// The laser-pointer and drawing-mode hotkeys and whether the OS accepted each (false: another app has it).
#[tauri::command]
fn get_demo_hotkeys(app: AppHandle, state: tauri::State<'_, AppSettings>) -> DemoHotkeys {
    use hotkey::ShortcutRegistry;
    let (laser_pointer, drawing_mode) = {
        let data = state.data.lock().unwrap();
        (data.laser_pointer_hotkey.clone(), data.drawing_mode_hotkey.clone())
    };
    let reg = registry(&app);
    let laser_pointer_registered = reg.is_registered(&laser_pointer);
    let drawing_mode_registered = reg.is_registered(&drawing_mode);
    diag::log(&format!(
        "get_demo_hotkeys: laser pointer {laser_pointer} (registered by this app: {laser_pointer_registered}), drawing mode {drawing_mode} (registered by this app: {drawing_mode_registered})"
    ));
    DemoHotkeys { laser_pointer, drawing_mode, laser_pointer_registered, drawing_mode_registered }
}

/// Re-registers one demo hotkey (`action`: "laserPointer" or "drawingMode") and saves it, like `set_hotkey`.
/// Errors: "print-screen", "capture-hotkey", "other-demo" (refused before anything changes), "conflict" (another
/// app owns it), "invalid", "failed" (could not save); the old hotkey stays in force on every error.
#[tauri::command]
fn set_demo_hotkey(
    app: AppHandle,
    state: tauri::State<'_, AppSettings>,
    demo: tauri::State<'_, DemoShortcuts>,
    action: String,
    accelerator: String,
) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let is_laser_pointer = match action.as_str() {
        "laserPointer" => true,
        "drawingMode" => false,
        _ => return Err("invalid".to_string()),
    };
    let (old, other) = if is_laser_pointer {
        (data.laser_pointer_hotkey.clone(), data.drawing_mode_hotkey.clone())
    } else {
        (data.drawing_mode_hotkey.clone(), data.laser_pointer_hotkey.clone())
    };
    diag::log(&format!("set_demo_hotkey: {action} requested {accelerator} (current {old})"));
    if let Some(code) = hotkey::demo_refusal(&accelerator, &data.hotkey, &other) {
        diag::log(&format!("set_demo_hotkey: {accelerator} refused ({code}); {old} stays in force"));
        return Err(code.to_string());
    }
    let mut next = data.clone();
    if is_laser_pointer {
        next.laser_pointer_hotkey = accelerator.clone();
    } else {
        next.drawing_mode_hotkey = accelerator.clone();
    }
    let outcome = hotkey::change_hotkey(&registry(&app), &old, &accelerator, || {
        settings::save(&state.dir, &next)
            .inspect_err(|e| diag::log(&format!("set_demo_hotkey: could not save settings.json: {e}")))
    });
    match outcome {
        Ok(()) => {
            diag::log(&format!("set_demo_hotkey: {accelerator} is now the {action} hotkey (saved)"));
            if is_laser_pointer {
                data.laser_pointer_hotkey = accelerator.clone();
            } else {
                data.drawing_mode_hotkey = accelerator.clone();
            }
            demo.set(if is_laser_pointer { LASER_POINTER_SLOT } else { DRAWING_MODE_SLOT }, &accelerator);
            if is_laser_pointer {
                laser_pointer::refresh_tray_label(&app, &accelerator);
            } else {
                drawing::update_tray_label(&app, &accelerator);
            }
            Ok(())
        }
        Err(code) => {
            diag::log(&format!("set_demo_hotkey: {accelerator} refused ({code}); {old} stays in force"));
            Err(code.to_string())
        }
    }
}

/// How the laser pointer looks (colour, size, ripple), stored in settings.json (ticket 50).
#[tauri::command]
fn get_laser_pointer_settings(state: tauri::State<'_, AppSettings>) -> settings::LaserPointerSettings {
    state.data.lock().unwrap().laser_pointer_settings()
}

/// Stores how the laser pointer looks and shows it at once on a visible dot. A failed write is logged and the
/// value stays in memory for this run; a colour that is not #RRGGBB or an unknown size is refused.
#[tauri::command]
fn set_laser_pointer_settings(
    app: AppHandle,
    state: tauri::State<'_, AppSettings>,
    laser_pointer: settings::LaserPointerSettings,
) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_laser_pointer_settings(&state.dir, &mut data, &laser_pointer);
    if let Err(e) = &saved {
        diag::log(&format!("laser pointer settings {laser_pointer:?}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.laser_pointer_settings();
    drop(data);
    laser_pointer::apply_settings(&app, &now);
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Whether the laser pointer hides the system mouse arrow while it is on (`laserPointerHideCursor`, default true).
#[tauri::command]
fn get_laser_pointer_hide_cursor(state: tauri::State<'_, AppSettings>) -> bool {
    state.data.lock().unwrap().laser_pointer_hide_cursor
}

/// Stores `laserPointerHideCursor` and applies it at once: with the Laser pointer on, the arrow is hidden or brought back. A
/// failed write is logged and the value stays in memory for this run.
#[tauri::command]
fn set_laser_pointer_hide_cursor(app: AppHandle, state: tauri::State<'_, AppSettings>, hide: bool) {
    let mut data = state.data.lock().unwrap();
    if let Err(e) = settings::set_laser_pointer_hide_cursor(&state.dir, &mut data, hide) {
        diag::log(&format!("laser pointer hide cursor set to {hide}; could not save settings.json (kept in memory): {e}"));
    }
    drop(data);
    laser_pointer::refresh_cursor(&app);
}

/// Drawing mode's Highlighter opacity in percent (`drawingHighlighterOpacity`, 5 to 60, default 20).
#[tauri::command]
fn get_drawing_highlighter_opacity(state: tauri::State<'_, AppSettings>) -> u32 {
    state.data.lock().unwrap().drawing_highlighter_opacity
}

/// Stores Drawing mode's Highlighter opacity; a value outside 5 to 60 is refused. It is read when Drawing mode starts.
#[tauri::command]
fn set_drawing_highlighter_opacity(state: tauri::State<'_, AppSettings>, percent: u32) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_drawing_highlighter_opacity(&state.dir, &mut data, percent);
    if let Err(e) = &saved {
        diag::log(&format!("Drawing mode Highlighter opacity set to {percent}; could not save settings.json (kept in memory): {e}"));
    }
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Switch the laser pointer on or off (the editor's button, ticket 51). Returns at once.
#[tauri::command]
fn set_laser_pointer(app: AppHandle, on: bool) {
    laser_pointer::request(&app, Some(on));
}

/// Whether Windows still gives Print Screen to Snipping Tool (read-only registry check), and
/// whether the one-time notice was already answered.
#[tauri::command]
fn get_print_screen_notice(state: tauri::State<'_, AppSettings>) -> PrintScreenNotice {
    let reading = print_screen::read();
    let dismissed = state.data.lock().unwrap().print_screen_notice_dismissed;
    diag::log(&format!("Settings read: {}; one-time notice answered: {dismissed}", reading.describe()));
    PrintScreenNotice { snipping_enabled: reading.enabled(), dismissed }
}

/// The Settings page writes a line to `capture.log` (what the hotkey recorder received).
#[tauri::command]
fn settings_log(message: String) {
    diag::log(&format!("settings page: {message}"));
}

#[tauri::command]
fn dismiss_print_screen_notice(state: tauri::State<'_, AppSettings>) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let mut next = data.clone();
    next.print_screen_notice_dismissed = true;
    settings::save(&state.dir, &next).map_err(|e| e.to_string())?;
    *data = next;
    diag::log("one-time Print Screen notice answered by a button click: printScreenNoticeDismissed is now true");
    Ok(())
}

/// Whether the capture overlay shows its magnifier (stored in settings.json; default true).
#[tauri::command]
fn get_magnifier(state: tauri::State<'_, AppSettings>) -> bool {
    state.data.lock().unwrap().magnifier
}

/// Stores the magnifier setting at once and tells every window (all overlays, Settings) the new
/// value. A failed write is logged and the value stays in memory for this run: the overlay is
/// never broken by it.
#[tauri::command]
fn set_magnifier(app: AppHandle, state: tauri::State<'_, AppSettings>, enabled: bool) {
    let mut data = state.data.lock().unwrap();
    match settings::set_magnifier(&state.dir, &mut data, enabled) {
        Ok(()) => diag::log(&format!("magnifier set to {enabled} (saved)")),
        Err(e) => diag::log(&format!("magnifier set to {enabled}; could not save settings.json (kept in memory): {e}")),
    }
    drop(data);
    let _ = app.emit(overlay::MAGNIFIER_EVENT, enabled);
}

const IMAGE_SETTINGS_EVENT: &str = "image-settings";

/// The default background for new images and the transparency checkerboard (stored in settings.json).
#[tauri::command]
fn get_image_settings(state: tauri::State<'_, AppSettings>) -> settings::ImageSettings {
    state.data.lock().unwrap().image_settings()
}

/// Stores the default background for new images and tells every window (the editor shows it at once). A
/// failed write is logged and the value stays in memory for this run; an unknown value is refused.
#[tauri::command]
fn set_image_background(app: AppHandle, state: tauri::State<'_, AppSettings>, background: String) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_image_background(&state.dir, &mut data, &background);
    if let Err(e) = &saved {
        diag::log(&format!("image background set to {background}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.image_settings();
    drop(data);
    let _ = app.emit(IMAGE_SETTINGS_EVENT, now);
    // A refused value is the only error the page needs to hear about; a failed write is only logged.
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Stores the transparency checkerboard choice; same rules as `set_image_background`.
#[tauri::command]
fn set_checkerboard(app: AppHandle, state: tauri::State<'_, AppSettings>, theme: String) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_transparency_checkerboard(&state.dir, &mut data, &theme);
    if let Err(e) = &saved {
        diag::log(&format!("checkerboard set to {theme}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.image_settings();
    drop(data);
    let _ = app.emit(IMAGE_SETTINGS_EVENT, now);
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Stores the canvas margin; same rules as `set_image_background` (a value outside its range is refused).
#[tauri::command]
fn set_canvas_margin(app: AppHandle, state: tauri::State<'_, AppSettings>, pixels: u32) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_canvas_margin(&state.dir, &mut data, pixels);
    if let Err(e) = &saved {
        diag::log(&format!("the canvas margin set to {pixels}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.image_settings();
    drop(data);
    let _ = app.emit(IMAGE_SETTINGS_EVENT, now);
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Stores the canvas margin used while cropping; same rules as `set_canvas_margin`.
#[tauri::command]
fn set_crop_margin(app: AppHandle, state: tauri::State<'_, AppSettings>, pixels: u32) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_crop_margin(&state.dir, &mut data, pixels);
    if let Err(e) = &saved {
        diag::log(&format!("the crop margin set to {pixels}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.image_settings();
    drop(data);
    let _ = app.emit(IMAGE_SETTINGS_EVENT, now);
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Stores the Dark image background colour (`#RRGGBB`); same rules as `set_image_background`.
#[tauri::command]
fn set_dark_background(app: AppHandle, state: tauri::State<'_, AppSettings>, color: String) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_dark_background(&state.dir, &mut data, &color);
    if let Err(e) = &saved {
        diag::log(&format!("the dark background set to {color}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.image_settings();
    drop(data);
    let _ = app.emit(IMAGE_SETTINGS_EVENT, now);
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Stores whether the Library Strip is collapsed; same rules as `set_show_outside_default`.
#[tauri::command]
fn set_library_strip_collapsed(app: AppHandle, state: tauri::State<'_, AppSettings>, collapsed: bool) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_library_strip_collapsed(&state.dir, &mut data, collapsed);
    if let Err(e) = &saved {
        diag::log(&format!("the Library Strip collapsed set to {collapsed}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.image_settings();
    drop(data);
    let _ = app.emit(IMAGE_SETTINGS_EVENT, now);
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Stores the outside darkness; same rules as `set_image_background` (a value outside its range is refused).
#[tauri::command]
fn set_outside_darkness(app: AppHandle, state: tauri::State<'_, AppSettings>, percent: f64) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_outside_darkness(&state.dir, &mut data, percent);
    if let Err(e) = &saved {
        diag::log(&format!("the outside darkness set to {percent}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.image_settings();
    drop(data);
    let _ = app.emit(IMAGE_SETTINGS_EVENT, now);
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Stores show-outside-by-default; same rules as `set_image_background` (a value outside its range is refused).
#[tauri::command]
fn set_show_outside_default(app: AppHandle, state: tauri::State<'_, AppSettings>, show: bool) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let saved = settings::set_show_outside_default(&state.dir, &mut data, show);
    if let Err(e) = &saved {
        diag::log(&format!("show-outside-by-default set to {show}; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.image_settings();
    drop(data);
    let _ = app.emit(IMAGE_SETTINGS_EVENT, now);
    saved.or_else(|e| if e.kind() == std::io::ErrorKind::InvalidInput { Err(e.to_string()) } else { Ok(()) })
}

/// Each drawing tool's last style, as stored in settings.json (the editor reads and checks it).
#[tauri::command]
fn get_tool_styles(state: tauri::State<'_, AppSettings>) -> serde_json::Map<String, serde_json::Value> {
    state.data.lock().unwrap().tool_styles.clone()
}

/// Stores the tool styles at once. A failed write is logged and the value stays in memory for this
/// run: restyling is never broken by it.
#[tauri::command]
fn set_tool_styles(state: tauri::State<'_, AppSettings>, styles: serde_json::Map<String, serde_json::Value>) {
    let mut data = state.data.lock().unwrap();
    if let Err(e) = settings::set_tool_styles(&state.dir, &mut data, styles) {
        diag::log(&format!("tool styles changed; could not save settings.json (kept in memory): {e}"));
    }
}

/// Event carrying the stored shortcut overrides to every window (open overlays, the editor, Settings).
const SHORTCUT_OVERRIDES_EVENT: &str = "shortcut-overrides";

/// The user's changed keyboard shortcuts (action id to key), as stored in settings.json; the front
/// end validates what it reads.
#[tauri::command]
fn get_shortcut_overrides(state: tauri::State<'_, AppSettings>) -> serde_json::Map<String, serde_json::Value> {
    state.data.lock().unwrap().shortcuts.clone()
}

/// Stores the shortcut overrides at once. A failed write is logged and the value stays in memory for this run.
#[tauri::command]
fn set_shortcut_overrides(app: AppHandle, state: tauri::State<'_, AppSettings>, overrides: serde_json::Map<String, serde_json::Value>) {
    let mut data = state.data.lock().unwrap();
    if let Err(e) = settings::set_shortcuts(&state.dir, &mut data, overrides) {
        diag::log(&format!("shortcuts changed; could not save settings.json (kept in memory): {e}"));
    }
    let now = data.shortcuts.clone();
    drop(data);
    let _ = app.emit(SHORTCUT_OVERRIDES_EVENT, now);
}

/// Whether the app starts when the user signs in to Windows (default on; stored in settings.json).
#[tauri::command]
fn get_launch_at_sign_in(state: tauri::State<'_, AppSettings>) -> bool {
    state.data.lock().unwrap().launch_at_sign_in
}

/// Turns launch at sign-in on or off: the per-user Run key first, then the stored choice, so a
/// refused registry write leaves both as they were and the error reaches the Settings page.
#[tauri::command]
fn set_launch_at_sign_in(state: tauri::State<'_, AppSettings>, enabled: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    autostart::apply(&autostart::HkcuRun, enabled, &exe)
        .inspect_err(|e| diag::log(&format!("launch at sign-in {enabled}: {e}")))?;
    let mut data = state.data.lock().unwrap();
    match settings::set_launch_at_sign_in(&state.dir, &mut data, enabled) {
        Ok(()) => diag::log(&format!("launch at sign-in set to {enabled} (saved)")),
        Err(e) => diag::log(&format!("launch at sign-in set to {enabled}; could not save settings.json (kept in memory): {e}")),
    }
    Ok(())
}

/// Makes the Run key match the stored choice, at every start: an install that moved is corrected and
/// a fresh install (default on) registers itself. Skipped in debug builds, so running from a source
/// checkout never puts a development exe into the user's startup list.
fn sync_launch_at_sign_in(enabled: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let result = std::env::current_exe()
        .map_err(|e| e.to_string())
        .and_then(|exe| autostart::apply(&autostart::HkcuRun, enabled, &exe));
    match result {
        Ok(change) => diag::log(&format!("launch at sign-in ({enabled}): Run key {change:?}")),
        Err(e) => diag::log(&format!("launch at sign-in ({enabled}): could not update the Run key: {e}")),
    }
}

/// The Library folder, for Settings to show (read-only there).
#[tauri::command]
fn library_folder(app: AppHandle) -> Result<String, String> {
    Ok(library_root(&app)?.to_string_lossy().into_owned())
}

/// Shows the Library folder in Explorer, creating it first if no capture was saved yet.
#[tauri::command]
fn open_library_folder(app: AppHandle) -> Result<(), String> {
    let root = library_root(&app)?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(root.to_string_lossy().into_owned(), None::<&str>).map_err(|e| e.to_string())
}

/// Settings > Reset tool styles: forget every sticky style, store that, and tell every window that
/// holds some (the editor, which stays loaded while hidden) to drop them too.
#[tauri::command]
fn reset_tool_styles(app: AppHandle, state: tauri::State<'_, AppSettings>) {
    let mut data = state.data.lock().unwrap();
    match settings::reset_tool_styles(&state.dir, &mut data) {
        Ok(()) => diag::log("tool styles reset (saved)"),
        Err(e) => diag::log(&format!("tool styles reset; could not save settings.json (kept in memory): {e}")),
    }
    drop(data);
    let _ = app.emit(TOOL_STYLES_RESET_EVENT, ());
}

/// Opens Windows Settings > Bluetooth & devices (the user then clicks Keyboard). A fixed target, deliberately not routed
/// through `open_url`, whose allowlist stays limited to the Releases page (ADR 0006).
#[tauri::command]
fn open_keyboard_settings() -> Result<(), String> {
    tauri_plugin_opener::open_url(print_screen::SETTINGS_URI, None::<&str>).map_err(|e| e.to_string())
}

/// Capture the monitor under the cursor (what the hotkey does) and hand it to the editor.
#[tauri::command]
fn start_capture(app: AppHandle) {
    capture_async(app, "editor button");
}

/// The delay timer (tray menu, the editor's top bar): hide the editor, count `seconds` down next to the
/// mouse pointer, then capture. Only the delays in `delay::CHOICES` are accepted. A plain `fn` is fine
/// here: the countdown and the window work run on a thread of their own (see `overlay::begin_delayed`).
#[tauri::command]
fn start_delayed_capture(app: AppHandle, seconds: u32) -> Result<(), String> {
    if delay::delay_for(seconds).is_none() {
        return Err(format!("{seconds} s is not one of {:?}", delay::CHOICES));
    }
    overlay::begin_delayed(app, seconds);
    Ok(())
}

/// Returns the pending Capture (see `pack_capture`) and clears it; an empty body when none.
#[tauri::command]
fn take_capture(state: tauri::State<'_, PendingCapture>) -> Response {
    Response::new(state.0.lock().unwrap().take().unwrap_or_default())
}

/// Puts a plain PNG (the Export) on the clipboard.
#[tauri::command]
fn copy_image(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(png) = request.body() else {
        return Err("expected raw PNG bytes".into());
    };
    write_plain_png_to_clipboard(&app, png)
}

/// The one clipboard-writing path, for the Copy button and the automatic copy of a new Capture:
/// refuses anything but a plain PNG (ADR 0002, ADR 0004), then writes it.
fn write_plain_png_to_clipboard(app: &AppHandle, png: &[u8]) -> Result<(), String> {
    png_guard::require_plain_png(png)?;
    let image = tauri::image::Image::from_bytes(png).map_err(|e| e.to_string())?;
    app.clipboard().write_image(&image).map_err(|e| e.to_string())
}

/// Saves a new Library PNG under Pictures\Screenshot Annotation\YYYY-MM\. The `x-captured-at`
/// header carries the local capture time as `YYYY-MM-DD HHmmss`. Returns the path written.
#[tauri::command]
fn library_save(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw PNG bytes".into());
    };
    png_guard::require_png(bytes)?;
    let stamp = request
        .headers()
        .get("x-captured-at")
        .and_then(|v| v.to_str().ok())
        .and_then(library::Stamp::parse)
        .ok_or("missing or malformed x-captured-at header")?;
    let root = app
        .path()
        .picture_dir()
        .map_err(|e| e.to_string())?
        .join(library::LIBRARY_FOLDER);
    let path = library::save_new(&root, &stamp, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn library_root(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().picture_dir().map_err(|e| e.to_string())?.join(library::LIBRARY_FOLDER))
}

/// What the Library commands share: the pixel sizes already read, and the copies of just-deleted files
/// that Undo writes back (see `library_index::TrashStash`).
#[derive(Default)]
struct LibraryState {
    sizes: Mutex<library_index::SizeCache>,
    trash: Mutex<library_index::TrashStash>,
}

/// Moves one Library PNG to the Windows Recycle Bin, first keeping a copy in memory for Undo.
/// Refuses any path that is not a `.png` inside the Library folder. `key` is the path as the webview
/// named it, which is what Undo is later asked for.
fn trash_library_file(app: &AppHandle, key: &str) -> Result<(), String> {
    let root = library_root(app)?;
    let file = library::library_file_in(&root, std::path::Path::new(key)).ok_or("not a file in the Library")?;
    let bytes = std::fs::read(&file).map_err(|e| e.to_string())?;
    library::move_to_recycle_bin(&file)?;
    app.state::<LibraryState>().trash.lock().unwrap().add(key.to_string(), file, bytes);
    Ok(())
}

/// Discard: moves a Library PNG to the Windows Recycle Bin (spec: deletes are recoverable).
#[tauri::command]
async fn library_discard(app: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || trash_library_file(&app, &path))
        .await
        .map_err(|e| e.to_string())?
}

/// Delete from the Library Strip or grid: moves each path to the Recycle Bin. Returns the paths that
/// were moved; one that is already gone (deleted in Explorer) or refused is skipped, not an error.
#[tauri::command]
async fn library_trash(app: AppHandle, paths: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths.into_iter().filter(|p| trash_library_file(&app, p).is_ok()).collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct Restored {
    from: String,
    to: String,
}

/// Undo of a delete: writes the files for `paths` back into the Library from the copies kept in memory.
/// Returns where each one landed (its old path, or a `-2` name if that was taken since).
#[tauri::command]
fn library_restore(state: tauri::State<'_, LibraryState>, paths: Vec<String>) -> Vec<Restored> {
    state
        .trash
        .lock()
        .unwrap()
        .restore(&paths)
        .into_iter()
        .map(|(from, to)| Restored { from, to: to.to_string_lossy().into_owned() })
        .collect()
}

/// The Undo notice is over: the in-memory copies for `paths` are no longer needed.
#[tauri::command]
fn library_forget(state: tauri::State<'_, LibraryState>, paths: Vec<String>) {
    state.trash.lock().unwrap().forget(&paths);
}

/// Auto-save: replaces the contents of an existing Library PNG with the raw body (the Library PNG,
/// which carries the editable data; `require_png` only). The `x-library-path` header holds the path
/// as `encodeURIComponent` output. Refuses anything that is not an existing `.png` in the Library and
/// never creates a file, so a discarded image cannot be resurrected by a late save.
#[tauri::command]
fn library_update(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw PNG bytes".into());
    };
    png_guard::require_png(bytes)?;
    let path = request
        .headers()
        .get("x-library-path")
        .and_then(|v| v.to_str().ok())
        .and_then(library::percent_decode)
        .ok_or("missing or malformed x-library-path header")?;
    let root = library_root(&app)?;
    library::update_existing(&root, std::path::Path::new(&path), bytes)?;
    Ok(())
}

/// One Library file as the webview sees it: the path, file times (ms since the epoch), size in bytes
/// and the pixel size of its visible pixels. The webview sorts and groups them.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryItem {
    path: String,
    modified_ms: u64,
    created_ms: Option<u64>,
    bytes: u64,
    width: u32,
    height: u32,
}

fn thumbnail_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("thumbnails"))
}

/// Every PNG in the Library folder (the folder is the source of truth: files added or deleted in
/// Explorer show up here). Also tidies the thumbnail cache of thumbnails no file needs any more.
#[tauri::command]
async fn library_list(app: AppHandle) -> Result<Vec<LibraryItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = library_root(&app)?;
        let listed = {
            let state = app.state::<LibraryState>();
            let mut sizes = state.sizes.lock().unwrap();
            library_index::list_library(&root, &mut sizes)
        };
        // Only tidy when there is something to keep: an empty answer might just be a folder that is
        // briefly unreachable (a sync client mid-update), and the cache is cheap to keep but slow to rebuild.
        if !listed.is_empty() {
            if let Ok(dir) = thumbnail_dir(&app) {
                let keep = listed.iter().map(|l| library_index::thumbnail_name(&l.file, thumbnail::THUMB_EDGE)).collect();
                library_index::prune_thumbnails(&dir, &keep);
            }
        }
        Ok(listed
            .into_iter()
            .map(|l| LibraryItem {
                path: l.file.path.to_string_lossy().into_owned(),
                modified_ms: l.file.modified_ms,
                created_ms: l.file.created_ms,
                bytes: l.file.bytes,
                width: l.width,
                height: l.height,
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A short value that changes when a file is added, removed or changed in the Library: what the
/// webview polls to follow the folder (metadata only, so it is cheap).
#[tauri::command]
async fn library_signature(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(library_index::signature(&library_index::scan_pngs(&library_root(&app)?)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A Library PNG read for opening in the editor (see `pack_library_file`). Refuses anything that is
/// not a `.png` inside the Library.
#[tauri::command]
async fn library_read(app: AppHandle, path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = library_root(&app)?;
        let file = library::library_file_in(&root, std::path::Path::new(&path)).ok_or("not a file in the Library")?;
        let png = std::fs::read(&file).map_err(|e| e.to_string())?;
        Ok(Response::new(library::pack_library_file(&file, &png)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A thumbnail PNG of a Library file, from the cache in local app data or made now and cached. Never
/// writes under Pictures.
#[tauri::command]
async fn library_thumbnail(app: AppHandle, path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = library_root(&app)?;
        let file = library::library_file_in(&root, std::path::Path::new(&path)).ok_or("not a file in the Library")?;
        let meta = std::fs::metadata(&file).map_err(|e| e.to_string())?;
        let to_ms = |t: std::time::SystemTime| {
            t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
        };
        let scanned = library_index::Scanned {
            modified_ms: meta.modified().map(to_ms).unwrap_or(0),
            created_ms: meta.created().ok().map(to_ms),
            bytes: meta.len(),
            path: file.clone(),
        };
        let cached = thumbnail_dir(&app)?.join(library_index::thumbnail_name(&scanned, thumbnail::THUMB_EDGE));
        if let Ok(png) = std::fs::read(&cached) {
            return Ok(Response::new(png));
        }
        let thumb = thumbnail::make_thumbnail(&std::fs::read(&file).map_err(|e| e.to_string())?, thumbnail::THUMB_EDGE)?;
        // The cache is a convenience: a failed write only means this thumbnail is made again next time.
        let _ = library::write_atomic(&cached, &thumb);
        Ok(Response::new(thumb))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The folder of the undo history files: `<app local data>/history` (never inside a PNG).
fn history_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join(history_store::HISTORY_FOLDER))
}

/// The undo history text stored for `key` (64 hex characters), or null when there is none.
#[tauri::command]
fn history_read(app: AppHandle, key: String) -> Result<Option<String>, String> {
    history_store::read(&history_dir(&app)?, &key)
}

/// Stores the undo history text for `key`, replacing any earlier one atomically.
#[tauri::command]
fn history_write(app: AppHandle, key: String, text: String) -> Result<(), String> {
    history_store::write(&history_dir(&app)?, &key, &text)
}

/// Deletes the undo history for `key` (the image was discarded, or its history is stale).
#[tauri::command]
fn history_delete(app: AppHandle, key: String) -> Result<(), String> {
    history_store::delete(&history_dir(&app)?, &key)
}

/// Deletes every undo history last written before `cutoff_ms` (ms since the epoch; the webview
/// computes it as now minus 60 days). Returns how many were deleted.
#[tauri::command]
fn history_purge_before(app: AppHandle, cutoff_ms: f64) -> Result<usize, String> {
    Ok(history_store::purge_before(&history_dir(&app)?, cutoff_ms.max(0.0) as u64))
}

/// Opens the Settings window (the editor's gear button).
///
/// Must stay `async` (ticket 36): a plain `fn` command runs on the main thread, inside WebView2's
/// own message callback, and creating a window there deadlocks on Windows (a blank white window
/// that cannot be closed, then a frozen app). An async command runs on a worker thread, which
/// waits while the main thread builds the window. `windowThreading.test.ts` enforces this.
#[tauri::command]
async fn open_settings(app: AppHandle) {
    diag::log("settings requested (editor gear button)");
    show_settings(&app);
}

/// Save as PNG…: shows the Windows save dialog (suggesting the `x-suggested-name` header) and
/// writes the raw PNG body, a plain Export, where the user chooses. Returns the path, or null if
/// they cancelled. Async so the blocking dialog does not stall the main thread.
#[tauri::command]
async fn save_png_as(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw PNG bytes".into());
    };
    // Checked before the dialog so a refused Export never asks the user for a location.
    png_guard::require_plain_png(bytes)?;
    let name = library::dialog_file_name(
        request.headers().get("x-suggested-name").and_then(|v| v.to_str().ok()).unwrap_or(""),
    );
    let mut dialog = app.dialog().file().add_filter("PNG image", &["png"]).set_file_name(name);
    if let Ok(pictures) = app.path().picture_dir() {
        dialog = dialog.set_directory(pictures);
    }
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let mut path = chosen.into_path().map_err(|e| e.to_string())?;
    if path.extension().is_none() {
        path.set_extension("png");
    }
    library::write_atomic(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// The one place a window is created, so every window carries the app logo: Windows takes the
/// taskbar and Alt+Tab icon from the window, and a window made at runtime has none of its own.
/// `default_window_icon()` is the `bundle.icon` set (on Windows, the icon resource embedded in the
/// exe); if it is missing or refused the window is still created, just with the system icon.
pub(crate) fn new_window<'a>(app: &'a AppHandle, label: &str, url: WebviewUrl) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let make = || WebviewWindowBuilder::new(app, label, url.clone());
    let with_icon = app.default_window_icon().cloned().and_then(|icon| make().icon(icon).ok());
    with_icon.unwrap_or_else(|| {
        diag::log(&format!("window {label}: no app icon available, using the system default"));
        make()
    })
}

fn focus(win: &tauri::WebviewWindow) {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
}

/// Run window work on a thread of its own and return at once. Everything that reacts to a native
/// event on the main thread (tray click and menu, a second launch of the app) goes through this:
/// Tauri documents that creating a window from a synchronous command or an event handler
/// deadlocks on Windows. A worker thread may block until the main thread has built the window.
fn on_worker_thread(app: &AppHandle, work: fn(&AppHandle)) {
    let app = app.clone();
    std::thread::spawn(move || work(&app));
}

/// `show_settings` for callers on the main thread (tray menu).
fn request_settings(app: &AppHandle, source: &str) {
    diag::log(&format!("settings requested ({source})"));
    on_worker_thread(app, show_settings);
}

/// `show_editor` for callers on the main thread (tray click and menu, a second launch).
fn request_editor(app: &AppHandle, source: &str) {
    diag::log(&format!("editor requested ({source})"));
    on_worker_thread(app, show_editor);
}

/// Creates the window `label` with `create`, unless one already exists (then that one is returned,
/// `false` for "not created now"). A window the user has just closed keeps its label for a moment;
/// creating the same label then fails, so that is retried (see `window_open.rs`), looking for the
/// existing window again each time. Every outcome goes to `capture.log`. Call from a worker thread.
fn create_or_existing(
    app: &AppHandle,
    label: &str,
    create: impl Fn() -> tauri::Result<tauri::WebviewWindow>,
) -> Option<(tauri::WebviewWindow, bool)> {
    use window_open::Attempt;
    let (result, attempts) = window_open::retry(&window_open::RETRY_PAUSES, std::thread::sleep, || {
        if let Some(win) = app.get_webview_window(label) {
            return Attempt::Done((win, false));
        }
        match create() {
            Ok(win) => Attempt::Done((win, true)),
            Err(e @ (tauri::Error::WebviewLabelAlreadyExists(_) | tauri::Error::WindowLabelAlreadyExists(_))) => {
                Attempt::LabelTaken(e)
            }
            Err(e) => Attempt::Failed(e),
        }
    });
    match result {
        Ok((win, created)) => {
            diag::log(&format!(
                "{label} window: {} (attempt {attempts})",
                if created { "created" } else { "already open" }
            ));
            Some((win, created))
        }
        Err(e) => {
            diag::log(&format!("{label} window: could not be created after {attempts} attempt(s): {e}"));
            None
        }
    }
}

/// Show the Settings window, creating it on first use and focusing it if it already exists. Never
/// call from the main thread or a sync command (see `open_settings`); use `request_settings`.
fn show_settings(app: &AppHandle) {
    let make = || {
        new_window(app, SETTINGS_LABEL, WebviewUrl::App("index.html#settings".into()))
            .title("Settings")
            .inner_size(480.0, 720.0)
            .resizable(false)
            .build()
    };
    if let Some((win, created)) = create_or_existing(app, SETTINGS_LABEL, make) {
        if !created {
            focus(&win);
            diag::log("settings window: focused");
        }
    }
}

/// The editor's maximized/normal state as the user last left it this session (set when the window
/// is hidden or closed); `None` until then. In memory only, never written to disk.
#[derive(Default)]
struct EditorMaximized(Mutex<Option<bool>>);

fn remember_editor_state(win: &tauri::WebviewWindow) {
    if let Ok(maximized) = win.is_maximized() {
        *win.app_handle().state::<EditorMaximized>().0.lock().unwrap() = Some(maximized);
    }
}

/// Hide the editor (for a capture, or when the user closes it), remembering whether it was maximized.
/// The window stays loaded, so showing it again is instant (ADR 0003).
pub(crate) fn hide_editor(win: &tauri::WebviewWindow) {
    remember_editor_state(win);
    let _ = win.hide();
}

/// Minimize the editor for a capture (instead of hiding it, so it is out of the picture at once), remembering
/// whether it was maximized. `show_editor` brings it back, in the state it was in.
pub(crate) fn minimize_editor(win: &tauri::WebviewWindow) {
    remember_editor_state(win);
    let _ = win.minimize();
}

/// The user closed the editor: hide it to the tray instead (the app keeps running so the hotkey
/// works), and the first time only, tell them so. Called from the window-event handler, so the
/// notice is shown from a thread of its own.
fn close_editor_to_tray(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(EDITOR_LABEL) {
        hide_editor(&win);
        diag::log("editor closed: hidden to the tray");
    }
    let Some(state) = app.try_state::<AppSettings>() else { return };
    let first_time = settings::take_tray_notice(&state.dir, &mut state.data.lock().unwrap());
    if first_time {
        let app = app.clone();
        std::thread::spawn(move || {
            use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
            app.dialog()
                .message(
                    "Screenshot Annotation is still running in the system tray, so the capture hotkey keeps \
                     working.\n\nClick its tray icon to open the editor again, or right-click it and choose Exit to quit.",
                )
                .title("Screenshot Annotation")
                .kind(MessageDialogKind::Info)
                .blocking_show();
        });
    }
}

/// The editor window as it is created: the one place its title, size and URL are set, for the hidden
/// pre-warmed window and for a window made on demand.
fn editor_builder<'a>(app: &'a AppHandle) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    new_window(app, EDITOR_LABEL, WebviewUrl::App("index.html".into()))
        .title("Screenshot Annotation")
        .inner_size(1100.0, 720.0)
        .min_inner_size(760.0, 480.0)
}

/// Create the editor window hidden at startup, so the first capture only has to show it (ADR 0003).
/// Blocks while WebView2 builds it: call from a worker thread (see `warm_up`). A failure only costs
/// speed: `show_editor` creates the window on demand.
fn prewarm_editor(app: &AppHandle) {
    let started = std::time::Instant::now();
    let make = || editor_builder(app).visible(false).build();
    if let Some((_, true)) = create_or_existing(app, EDITOR_LABEL, make) {
        diag::log(&format!("editor window pre-warmed in {} ms (hidden)", started.elapsed().as_millis()));
    }
}

/// Everything ADR 0003 keeps loaded and hidden while the app sits in the tray: the editor and one
/// overlay per monitor. Runs on a worker thread of its own at startup.
fn warm_up(app: &AppHandle) {
    prewarm_editor(app);
    overlay::prewarm(app);
}

/// Show the editor window maximized (normal chrome kept), creating it on first use if it is not
/// there (normally it is: `prewarm_editor` made it hidden at startup and closing only hides it). A
/// window the user is looking at is only focused, never resized. A hidden one is shown in the
/// state the user left it (maximized on its first show). Never call from the main thread or a
/// sync command; use `request_editor`.
fn show_editor(app: &AppHandle) {
    let remembered = *app.state::<EditorMaximized>().0.lock().unwrap();
    let maximize = editor_window::should_maximize(remembered);
    if let Some(win) = app.get_webview_window(EDITOR_LABEL) {
        if !win.is_visible().unwrap_or(true) {
            if maximize {
                let _ = win.maximize();
            } else {
                let _ = win.unmaximize();
            }
        }
        focus(&win);
        return;
    }
    let make = || editor_builder(app).maximized(maximize).build();
    if let Some((win, created)) = create_or_existing(app, EDITOR_LABEL, make) {
        if !created {
            focus(&win);
        }
    }
}

/// Start a capture (hotkey, tray): freeze the screen and open the overlay; see overlay.rs.
fn capture_async(app: AppHandle, source: &str) {
    overlay::begin(app, source);
}

/// Opens the folder that holds `capture.log` (the diagnostics log; see diag.rs).
fn open_log_folder() {
    let Some(file) = diag::path() else { return };
    if let Some(dir) = file.parent() {
        if let Err(e) = tauri_plugin_opener::open_path(dir.to_string_lossy().into_owned(), None::<&str>) {
            diag::log(&format!("could not open the log folder: {e}"));
        }
    }
}

/// Hand a finished Capture (a plain PNG, already cropped to what was selected) to the editor and
/// show it. The Capture is also copied to the clipboard here, once per new capture, so it works
/// even if the editor window never loads and re-opening the editor never touches the clipboard
/// again. A clipboard failure only goes to `capture.log` and the editor's status line; the Library
/// save and the editor opening still happen.
///
/// Ordering with Windows' own Print Screen copy (ticket 26): the bare Print Screen hotkey is only
/// watched, never blocked, so Windows copies all monitors to the clipboard at the key press. This
/// function runs only after the user has made a selection in the overlay (seconds later, and after
/// the 150 ms editor hide and the screen freeze), so the write below comes last and replaces
/// Windows' copy. The frozen frames come from the screen (GDI BitBlt in capture.rs), never from
/// the clipboard, so Windows' copy cannot leak into a Capture. If the user cancels with Esc,
/// nothing is written and Windows' full-screen copy stays on the clipboard.
fn deliver_capture(app: &AppHandle, width: u32, height: u32, captured_at_ms: f64, png: &[u8]) {
    let clipboard = match write_plain_png_to_clipboard(app, png) {
        Ok(()) => {
            diag::log("capture copied to the clipboard");
            ClipboardOutcome::Copied
        }
        Err(e) => {
            diag::log(&format!("capture could not be copied to the clipboard: {e}"));
            ClipboardOutcome::Failed
        }
    };
    *app.state::<PendingCapture>().0.lock().unwrap() =
        Some(pack_capture(width, height, captured_at_ms, clipboard, png));
    show_editor(app);
    let _ = app.emit(CAPTURE_READY_EVENT, ());
}

pub fn run() {
    tauri::Builder::default()
        .manage(PendingCapture::default())
        .manage(LibraryState::default())
        .manage(EditorMaximized::default())
        .manage(countdown::CountdownState::default())
        .on_window_event(|window, event| {
            // Closing the editor hides it to the tray (ticket 23) and keeps it loaded (ADR 0003), so the
            // next capture or tray click only has to show it. Only the tray's Exit ends the app.
            if window.label() == EDITOR_LABEL {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    close_editor_to_tray(window.app_handle());
                }
            }
            // Settings closes on its own and touches no other window; the log shows it did.
            if window.label() == SETTINGS_LABEL {
                match event {
                    tauri::WindowEvent::CloseRequested { .. } => diag::log("settings window: close requested"),
                    tauri::WindowEvent::Destroyed => diag::log("settings window: closed (label free)"),
                    _ => {}
                }
            }
        })
        .manage(RawInput::default())
        .manage(overlay::OverlayState::default())
        .manage(drawing::DrawingState::default())
        // A second launch focuses the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| request_editor(app, "second launch")))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_version,
            open_url,
            start_capture,
            start_delayed_capture,
            countdown::countdown_remaining,
            take_capture,
            copy_image,
            library_save,
            library_discard,
            library_update,
            library_list,
            library_signature,
            library_read,
            library_thumbnail,
            library_trash,
            library_restore,
            library_forget,
            history_read,
            history_write,
            history_delete,
            history_purge_before,
            open_settings,
            get_launch_at_sign_in,
            set_launch_at_sign_in,
            library_folder,
            open_library_folder,
            reset_tool_styles,
            save_png_as,
            get_hotkey,
            set_hotkey,
            get_demo_hotkeys,
            set_demo_hotkey,
            get_laser_pointer_settings,
            set_laser_pointer_settings,
            set_laser_pointer,
            get_laser_pointer_hide_cursor,
            set_laser_pointer_hide_cursor,
            get_drawing_highlighter_opacity,
            set_drawing_highlighter_opacity,
            laser_pointer::get_laser_pointer,
            laser_pointer::laser_pointer_view,
            get_print_screen_notice,
            settings_log,
            dismiss_print_screen_notice,
            open_keyboard_settings,
            get_tool_styles,
            set_tool_styles,
            get_shortcut_overrides,
            set_shortcut_overrides,
            overlay::overlay_frame,
            overlay::overlay_windows,
            overlay::overlay_attempt,
            overlay::overlay_ready,
            overlay::overlay_log,
            overlay::overlay_finish,
            drawing::drawing_exit,
            drawing::set_drawing_tool,
            drawing::set_drawing_click_through,
            drawing::resize_drawing_toolbar,
            get_magnifier,
            set_magnifier,
            get_image_settings,
            set_image_background,
            set_checkerboard,
            set_canvas_margin,
            set_crop_margin,
            set_library_strip_collapsed,
            set_dark_background,
            set_outside_darkness,
            set_show_outside_default
        ])
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, shortcut, event| {
                        // The plugin only calls this for hotkeys this app registered: the capture hotkey,
                        // and Esc during a delay countdown; log every event it delivers.
                        diag::log(&format!("hotkey event: {} {:?}", shortcut.into_string(), event.state()));
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        // Esc is registered only while a delay countdown runs, and only cancels it.
                        if *shortcut == countdown::escape_shortcut() {
                            countdown::cancel(app);
                        } else {
                            match app.try_state::<DemoShortcuts>().and_then(|d| d.which(shortcut)) {
                                Some(LASER_POINTER_SLOT) => {
                                    diag::log("hotkey event: laser pointer hotkey pressed");
                                    laser_pointer::request(app, None);
                                }
                                Some(DRAWING_MODE_SLOT) => {
                                    diag::log("hotkey event: drawing mode hotkey pressed");
                                    drawing::toggle(app.clone(), "hotkey");
                                }
                                Some(CAPTURE_SLOT) => capture_async(app.clone(), "hotkey"),
                                // Registered a moment ago and not yet in its slot (a hotkey being changed): never a capture.
                                _ => diag::log("hotkey event: not a known hotkey (being changed?), ignored"),
                            }
                        }
                    })
                    .build(),
            )?;
            let dir = app.path().app_data_dir()?;
            diag::init(&dir);
            diag::log(&format!("started, version {}", app.package_info().version));
            let loaded = settings::load(&dir);
            // The handler tells the hotkeys apart by these slots: fill and manage them before registering any.
            let demo_shortcuts = DemoShortcuts::default();
            demo_shortcuts.set(CAPTURE_SLOT, &loaded.hotkey);
            demo_shortcuts.set(LASER_POINTER_SLOT, &loaded.laser_pointer_hotkey);
            demo_shortcuts.set(DRAWING_MODE_SLOT, &loaded.drawing_mode_hotkey);
            app.manage(demo_shortcuts);
            app.manage(laser_pointer::LaserPointerState::new(&loaded.laser_pointer_settings()));
            // An earlier run killed while the laser pointer hid the mouse arrow may have left it hidden.
            laser_pointer::restore_cursor_on_startup();
            // A taken hotkey must not stop the app from starting; Settings shows the conflict warning.
            let _ = hotkey::ShortcutRegistry::register(&registry(app.handle()), &loaded.hotkey);
            // The demo-tool hotkeys the same way (ticket 49): a taken one is shown in Settings > Demo tools.
            let _ = hotkey::ShortcutRegistry::register(&registry(app.handle()), &loaded.laser_pointer_hotkey);
            let _ = hotkey::ShortcutRegistry::register(&registry(app.handle()), &loaded.drawing_mode_hotkey);
            let reading = print_screen::read();
            diag::log(&format!(
                "startup: hotkey {}, one-time notice answered: {}; {}",
                loaded.hotkey,
                loaded.print_screen_notice_dismissed,
                reading.describe()
            ));
            let notice_pending = !loaded.print_screen_notice_dismissed && reading.enabled();
            let launch_at_sign_in = loaded.launch_at_sign_in;
            let laser_pointer_hotkey = loaded.laser_pointer_hotkey.clone();
            let drawing_hotkey = loaded.drawing_mode_hotkey.clone();
            app.manage(AppSettings { dir, data: Mutex::new(loaded) });
            if notice_pending {
                // First run: open Settings, where the one-time Print Screen notice lives.
                request_settings(app.handle(), "first run notice");
            }

            sync_launch_at_sign_in(launch_at_sign_in);

            let mut menu = MenuBuilder::new(app);
            // The laser pointer is off at every start (its state is not saved), so its item starts unchecked.
            for entry in tray_menu::entries(&delay::CHOICES, &laser_pointer_hotkey, false, &drawing_hotkey) {
                menu = match entry {
                    // The "Draw on screen" item is kept, so its label can follow the hotkey when it is changed.
                    tray_menu::Entry::Item { id, label } if id == tray_menu::DRAW_ID => {
                        let draw = MenuItem::with_id(app, id, label, true, None::<&str>)?;
                        let menu = menu.item(&draw);
                        app.manage(drawing::TrayItem(draw));
                        menu
                    }
                    tray_menu::Entry::Item { id, label } => menu.text(id, label),
                    tray_menu::Entry::Check { id, label, checked } => {
                        let item = CheckMenuItemBuilder::with_id(id, label).checked(checked).build(app.handle())?;
                        let menu = menu.item(&item);
                        app.state::<laser_pointer::LaserPointerState>().set_tray_item(item);
                        menu
                    }
                    tray_menu::Entry::Separator => menu.separator(),
                };
            }
            let mut tray = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.tooltip("Screenshot Annotation")
                .menu(&menu.build()?)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        request_editor(tray.app_handle(), "tray icon click");
                    }
                })
                .on_menu_event(|app, event| match tray_menu::action_for(event.id.as_ref()) {
                    Some(tray_menu::Action::Capture) => capture_async(app.clone(), "tray"),
                    Some(tray_menu::Action::CaptureIn(seconds)) => overlay::begin_delayed(app.clone(), seconds),
                    Some(tray_menu::Action::DrawOnScreen) => drawing::toggle(app.clone(), "tray"),
                    Some(tray_menu::Action::OpenLogFolder) => open_log_folder(),
                    Some(tray_menu::Action::ToggleLaserPointer) => laser_pointer::request(app, None),
                    Some(tray_menu::Action::OpenEditor) => request_editor(app, "tray menu"),
                    Some(tray_menu::Action::Settings) => request_settings(app, "tray menu"),
                    Some(tray_menu::Action::Exit) => app.exit(0),
                    None => {}
                })
                .build(app)?;
            // Last: the tray is usable at once; the hidden windows load behind it (ADR 0003).
            on_worker_thread(app.handle(), warm_up);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Screenshot Annotation")
        .run(|app, event| match event {
            // Closing a window must not quit the app; only the tray's Exit does (app.exit(0)).
            RunEvent::ExitRequested { api, code, .. } => {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
            // The app is going: bring the mouse arrow back if the laser pointer had hidden it.
            RunEvent::Exit => laser_pointer::restore_cursor_on_exit(app),
            _ => {}
        });
}
