// Throwaway probe for the "no-admin install" test. Not product code.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{fs, io::Write, path::PathBuf};
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn report_path() -> PathBuf { dirs::desktop_dir().unwrap_or_default().join("TauriProbe-report.txt") }
fn log(line: &str) {
    let mut f = fs::OpenOptions::new().create(true).append(true).open(report_path()).unwrap();
    let _ = writeln!(f, "{line}");
}

fn checks() {
    let _ = fs::remove_file(report_path());
    log(&format!("TauriProbe report {}", chrono::Local::now()));
    log(&format!("Exe path: {:?}", std::env::current_exe().ok()));
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    match hkcu.open_subkey(r"Control Panel\Keyboard").and_then(|k| k.get_value::<u32, _>("PrintScreenKeyForSnippingEnabled")) {
        Ok(v) => log(&format!("PrintScreenKeyForSnippingEnabled: {v}")),
        Err(_) => log("PrintScreenKeyForSnippingEnabled: (not set)"),
    }
    match hkcu.create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run").and_then(|(k, _)| {
        k.set_value("TauriProbe", &format!("\"{}\"", std::env::current_exe().unwrap().display()))
    }) {
        Ok(_) => log("HKCU Run (launch at sign-in): OK"),
        Err(e) => log(&format!("HKCU Run: FAILED {e}")),
    }
    let shot = (|| -> Result<(), String> {
        let mon = xcap::Monitor::all().map_err(|e| e.to_string())?;
        log(&format!("Monitors: {}", mon.len()));
        let img = mon.first().ok_or("no monitor")?.capture_image().map_err(|e| e.to_string())?;
        log(&format!("Screen capture: OK ({}x{})", img.width(), img.height()));
        let dir = dirs::picture_dir().ok_or("no Pictures")?.join("Screenshot Annotation");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let file = dir.join("probe-tauri.png");
        img.save(&file).map_err(|e| e.to_string())?;
        log(&format!("Write to Pictures: OK ({})", file.display()));
        let (w, h) = (img.width() as usize, img.height() as usize);
        arboard::Clipboard::new().and_then(|mut c| c.set_image(arboard::ImageData { width: w, height: h, bytes: img.into_raw().into() }))
            .map_err(|e| e.to_string())?;
        log("Clipboard image: OK (try pasting into Teams/Outlook)");
        Ok(())
    })();
    if let Err(e) = shot { log(&format!("Capture/save/clipboard: FAILED {e}")); }
}

fn main() {
    checks();
    let prt = Shortcut::new(None, Code::PrintScreen);
    let alt = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS);
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(move |_app, sc, ev| {
            if ev.state() == ShortcutState::Pressed {
                log(&format!("Hotkey {} received at {}", if *sc == prt { "PrintScreen" } else { "Ctrl+Shift+S" }, chrono::Local::now().format("%T")));
            }
        }).build())
        .setup(move |app| {
            for (name, sc) in [("PrintScreen", prt), ("Ctrl+Shift+S", alt)] {
                match app.global_shortcut().register(sc) {
                    Ok(_) => log(&format!("Register hotkey {name}: OK")),
                    Err(e) => log(&format!("Register hotkey {name}: FAILED {e}")),
                }
            }
            let open = MenuItem::with_id(app, "open", "Open report", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("TauriProbe")
                .menu(&Menu::with_items(app, &[&open, &quit])?)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => { let _ = std::process::Command::new("notepad.exe").arg(report_path()).spawn(); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("tauri build")
        .run(|_app, ev| if let tauri::RunEvent::ExitRequested { api, code, .. } = ev { if code.is_none() { api.prevent_exit(); } });
}
