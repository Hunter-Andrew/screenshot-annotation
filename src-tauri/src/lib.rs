mod capture;
mod capture_image;
mod hotkey;
mod library;
mod print_screen;
mod settings;
mod url_guard;

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{
    ipc::{InvokeBody, Request, Response},
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
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
        let shortcut: Shortcut = accelerator.parse().map_err(|_| hotkey::RegisterError::Invalid)?;
        self.0.global_shortcut().register(shortcut).map_err(|_| hotkey::RegisterError::Taken)
    }
    fn unregister(&self, accelerator: &str) {
        if let Ok(shortcut) = accelerator.parse::<Shortcut>() {
            let _ = self.0.global_shortcut().unregister(shortcut);
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

/// `take_capture` wire format: u32 LE width, u32 LE height, f64 LE capture time (ms since the
/// Unix epoch), then the PNG. An empty body means nothing is pending. `src/platform/tauriBridge.ts`
/// decodes it.
fn pack_capture(width: u32, height: u32, captured_at_ms: f64, png: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(16 + png.len());
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(&captured_at_ms.to_le_bytes());
    out.extend_from_slice(png);
    out
}

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
    HotkeyState { accelerator, registered }
}

/// Re-registers the capture hotkey and saves it. Errors: "conflict" (another app owns it; the old
/// hotkey stays), "invalid", "failed" (could not save; the old hotkey stays).
#[tauri::command]
fn set_hotkey(app: AppHandle, state: tauri::State<'_, AppSettings>, accelerator: String) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let old = data.hotkey.clone();
    let mut next = data.clone();
    next.hotkey = accelerator.clone();
    hotkey::change_hotkey(&PluginRegistry(&app), &old, &accelerator, || settings::save(&state.dir, &next))
        .map_err(String::from)?;
    data.hotkey = accelerator;
    Ok(())
}

/// Whether Windows still gives Print Screen to Snipping Tool (read-only registry check), and
/// whether the one-time notice was already answered.
#[tauri::command]
fn get_print_screen_notice(state: tauri::State<'_, AppSettings>) -> PrintScreenNotice {
    PrintScreenNotice {
        snipping_enabled: print_screen::snipping_enabled(),
        dismissed: state.data.lock().unwrap().print_screen_notice_dismissed,
    }
}

#[tauri::command]
fn dismiss_print_screen_notice(state: tauri::State<'_, AppSettings>) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    let mut next = data.clone();
    next.print_screen_notice_dismissed = true;
    settings::save(&state.dir, &next).map_err(|e| e.to_string())?;
    *data = next;
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
    capture_async(app);
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

/// Hide the editor, capture the monitor under the cursor, then show the editor with the result.
/// Runs on its own thread so the hotkey handler returns at once.
fn capture_async(app: AppHandle) {
    std::thread::spawn(move || {
        if let Some(win) = app.get_webview_window(EDITOR_LABEL) {
            if win.is_visible().unwrap_or(false) {
                let _ = win.hide();
                std::thread::sleep(HIDE_SETTLE);
            }
        }
        match capture::capture_monitor_under_cursor() {
            Ok(shot) => {
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as f64)
                    .unwrap_or(0.0);
                let packed = pack_capture(shot.width, shot.height, now_ms, &shot.png);
                *app.state::<PendingCapture>().0.lock().unwrap() = Some(packed);
                show_editor(&app);
                let _ = app.emit(CAPTURE_READY_EVENT, ());
            }
            Err(message) => {
                eprintln!("capture failed: {message}");
                if let Some(win) = app.get_webview_window(EDITOR_LABEL) {
                    focus(&win);
                }
            }
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .manage(PendingCapture::default())
        // A second launch focuses the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_editor(app)))
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            app_version,
            open_url,
            start_capture,
            take_capture,
            copy_image,
            library_save,
            get_hotkey,
            set_hotkey,
            get_print_screen_notice,
            dismiss_print_screen_notice,
            open_keyboard_accessibility_settings
        ])
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            capture_async(app.clone());
                        }
                    })
                    .build(),
            )?;
            let dir = app.path().app_data_dir()?;
            let loaded = settings::load(&dir);
            // A taken hotkey must not stop the app from starting; Settings shows the conflict warning.
            if let Err(e) = app.global_shortcut().register(loaded.hotkey.as_str()) {
                eprintln!("could not register {}: {e}", loaded.hotkey);
            }
            let notice_pending = !loaded.print_screen_notice_dismissed && print_screen::snipping_enabled();
            app.manage(AppSettings { dir, data: Mutex::new(loaded) });
            if notice_pending {
                // First run: open Settings, where the one-time Print Screen notice lives.
                show_settings(app.handle());
            }

            let capture = MenuItem::with_id(app, "capture", "Capture", true, None::<&str>)?;
            let editor = MenuItem::with_id(app, "editor", "Open editor", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Screenshot Annotation")
                .menu(&Menu::with_items(app, &[&capture, &editor, &settings, &exit])?)
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
                    "capture" => capture_async(app.clone()),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_capture_puts_size_time_then_the_png() {
        let packed = pack_capture(3, 2, 1.5, b"PNG");
        assert_eq!(&packed[0..4], 3u32.to_le_bytes());
        assert_eq!(&packed[4..8], 2u32.to_le_bytes());
        assert_eq!(&packed[8..16], 1.5f64.to_le_bytes());
        assert_eq!(&packed[16..], b"PNG");
    }
}
