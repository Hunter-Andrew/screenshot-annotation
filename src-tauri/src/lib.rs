mod capture;
mod capture_image;
mod capture_wire;
mod diag;
mod geometry;
mod hotkey;
mod library;
mod overlay;
mod png_guard;
mod print_screen;
mod settings;
mod url_guard;
mod watchdog;

use std::sync::Mutex;
use std::time::Duration;

use tauri::{
    ipc::{InvokeBody, Request, Response},
    menu::{Menu, MenuItem},
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
/// How long the editor stays hidden before the screen is read, so it is not in the picture.
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HotkeyState {
    accelerator: String,
    registered: bool,
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
    let registered = PluginRegistry(&app).is_registered(&accelerator);
    diag::log(&format!("get_hotkey: {accelerator}, registered by this app: {registered}"));
    HotkeyState { accelerator, registered }
}

/// Re-registers the capture hotkey and saves it. Errors: "conflict" (another app owns it; the old
/// hotkey stays), "invalid", "failed" (could not save; the old hotkey stays).
#[tauri::command]
fn set_hotkey(app: AppHandle, state: tauri::State<'_, AppSettings>, accelerator: String) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let old = data.hotkey.clone();
    diag::log(&format!("set_hotkey: requested {accelerator} (current {old})"));
    let mut next = data.clone();
    next.hotkey = accelerator.clone();
    let outcome = hotkey::change_hotkey(&PluginRegistry(&app), &old, &accelerator, || {
        settings::save(&state.dir, &next).inspect_err(|e| diag::log(&format!("set_hotkey: could not save settings.json: {e}")))
    });
    match outcome {
        Ok(()) => {
            diag::log(&format!("set_hotkey: {accelerator} is now the capture hotkey (saved)"));
            data.hotkey = accelerator;
            Ok(())
        }
        Err(code) => {
            diag::log(&format!("set_hotkey: {accelerator} refused ({code}); {old} stays in force"));
            Err(code.to_string())
        }
    }
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

/// Opens Windows Settings > Accessibility > Keyboard. A fixed target, deliberately not routed
/// through `open_url`, whose allowlist stays limited to the Releases page (ADR 0006).
#[tauri::command]
fn open_keyboard_accessibility_settings() -> Result<(), String> {
    tauri_plugin_opener::open_url(print_screen::SETTINGS_URI, None::<&str>).map_err(|e| e.to_string())
}

/// Capture the monitor under the cursor (what the hotkey does) and hand it to the editor.
#[tauri::command]
fn start_capture(app: AppHandle) {
    capture_async(app, "editor button");
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

/// Discard: moves a Library PNG to the Windows Recycle Bin (spec: deletes are recoverable).
/// Refuses any path that is not a `.png` inside the Library folder.
#[tauri::command]
fn library_discard(app: AppHandle, path: String) -> Result<(), String> {
    let root = library_root(&app)?;
    let file = library::library_file_in(&root, std::path::Path::new(&path))
        .ok_or("not a file in the Library")?;
    library::move_to_recycle_bin(&file)
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

fn focus(win: &tauri::WebviewWindow) {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
}

/// Show the Settings window, creating it on first use and focusing it if it already exists.
fn show_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(SETTINGS_LABEL) {
        focus(&win);
        return;
    }
    let _ = WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html#settings".into()))
        .title("Settings")
        .inner_size(460.0, 440.0)
        .resizable(false)
        .build();
}

/// Show the editor window, creating it on first use (pre-warming is ticket 24).
fn show_editor(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(EDITOR_LABEL) {
        focus(&win);
        return;
    }
    let _ = WebviewWindowBuilder::new(app, EDITOR_LABEL, WebviewUrl::App("index.html".into()))
        .title("Screenshot Annotation")
        .inner_size(1100.0, 720.0)
        .build();
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
        .manage(overlay::OverlayState::default())
        // A second launch focuses the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_editor(app)))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_version,
            open_url,
            start_capture,
            take_capture,
            copy_image,
            library_save,
            library_discard,
            save_png_as,
            get_hotkey,
            set_hotkey,
            get_print_screen_notice,
            settings_log,
            dismiss_print_screen_notice,
            open_keyboard_accessibility_settings,
            overlay::overlay_frame,
            overlay::overlay_windows,
            overlay::overlay_ready,
            overlay::overlay_log,
            overlay::overlay_finish,
            overlay::overlay_toggle_magnifier
        ])
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, shortcut, event| {
                        // The plugin only calls this for hotkeys this app registered, so there is one
                        // capture hotkey and nothing to compare; log every event it delivers.
                        diag::log(&format!("hotkey event: {} {:?}", shortcut.into_string(), event.state()));
                        if event.state() == ShortcutState::Pressed {
                            capture_async(app.clone(), "hotkey");
                        }
                    })
                    .build(),
            )?;
            let dir = app.path().app_data_dir()?;
            diag::init(&dir);
            diag::log(&format!("started, version {}", app.package_info().version));
            let loaded = settings::load(&dir);
            // A taken hotkey must not stop the app from starting; Settings shows the conflict warning.
            let _ = hotkey::ShortcutRegistry::register(&PluginRegistry(app.handle()), &loaded.hotkey);
            let reading = print_screen::read();
            diag::log(&format!(
                "startup: hotkey {}, one-time notice answered: {}; {}",
                loaded.hotkey,
                loaded.print_screen_notice_dismissed,
                reading.describe()
            ));
            let notice_pending = !loaded.print_screen_notice_dismissed && reading.enabled();
            app.manage(AppSettings { dir, data: Mutex::new(loaded) });
            if notice_pending {
                // First run: open Settings, where the one-time Print Screen notice lives.
                show_settings(app.handle());
            }

            let capture = MenuItem::with_id(app, "capture", "Capture", true, None::<&str>)?;
            let editor = MenuItem::with_id(app, "editor", "Open editor", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let log_folder = MenuItem::with_id(app, "log", "Open log folder", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Screenshot Annotation")
                .menu(&Menu::with_items(app, &[&capture, &editor, &settings, &log_folder, &exit])?)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_editor(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "capture" => capture_async(app.clone(), "tray"),
                    "log" => open_log_folder(),
                    "editor" => show_editor(app),
                    "settings" => show_settings(app),
                    "exit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Screenshot Annotation")
        .run(|_app, event| {
            // Closing a window must not quit the app; only the tray's Exit does (app.exit(0)).
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
