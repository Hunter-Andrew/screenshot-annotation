//! App settings, stored as `settings.json` under Tauri's `app_data_dir` (the `<identifier>` folder
//! under %APPDATA%) so the installer's upgrade and "delete app data" behavior covers them (ticket 03).
//! Later tickets add their own fields; `#[serde(default)]` keeps older files loading.
//!
//! What the fields in `settings.json` mean (plain language; the user may open this file):
//! - `hotkey`: the capture hotkey, e.g. "ctrl+shift+s" or "PrintScreen". Change it in Settings, not here.
//! - `printScreenNoticeDismissed`: true means "you answered the one-time Print Screen notice" (clicked
//!   either of its two buttons). It only stops that notice from showing again. It does NOT mean Print
//!   Screen works or that the Windows setting is off; the warning under the hotkey field reads that live
//!   from Windows. Setting it back to false (with the app closed) shows the notice once more.
//! - `magnifier`: true shows the magnifier in the capture overlay. Default true (also when the field
//!   is missing from an older file). The M key in the overlay and the Settings checkbox both change
//!   it, and the last value is used by the next capture.

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const FILE_NAME: &str = "settings.json";
pub const DEFAULT_HOTKEY: &str = "ctrl+shift+s";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Capture hotkey as an accelerator string, e.g. "ctrl+shift+s" or "PrintScreen".
    pub hotkey: String,
    /// The one-time Print Screen / Snipping Tool notice was answered.
    pub print_screen_notice_dismissed: bool,
    /// Show the magnifier in the capture overlay (default true).
    pub magnifier: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { hotkey: DEFAULT_HOTKEY.into(), print_screen_notice_dismissed: false, magnifier: true }
    }
}

/// Loads the settings; a missing or unreadable file gives the defaults.
pub fn load(dir: &Path) -> Settings {
    fs::read(dir.join(FILE_NAME))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Saves the settings atomically (temp file, then rename).
pub fn save(dir: &Path, settings: &Settings) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    fs::write(&tmp, serde_json::to_vec_pretty(settings)?)?;
    fs::rename(&tmp, dir.join(FILE_NAME))
}

/// Sets the magnifier value and then tries to save. The in-memory value changes even when the
/// write fails (the overlay keeps working this run); the error is returned for the caller to log.
pub fn set_magnifier(dir: &Path, settings: &mut Settings, enabled: bool) -> io::Result<()> {
    settings.magnifier = enabled;
    save(dir, settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("sa-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn missing_file_gives_defaults() {
        let s = load(&temp_dir("missing"));
        assert_eq!(s.hotkey, "ctrl+shift+s");
        assert!(!s.print_screen_notice_dismissed);
    }

    #[test]
    fn saved_settings_load_back_and_leave_no_temp_file() {
        let dir = temp_dir("roundtrip");
        let s = Settings { hotkey: "PrintScreen".into(), print_screen_notice_dismissed: true, magnifier: false };
        save(&dir, &s).unwrap();
        assert_eq!(load(&dir), s);
        assert!(!dir.join("settings.json.tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_corrupt_file_gives_defaults_instead_of_failing_startup() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), b"{ not json").unwrap();
        assert_eq!(load(&dir), Settings::default());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_file_missing_newer_fields_keeps_what_it_has() {
        let dir = temp_dir("partial");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        let s = load(&dir);
        assert_eq!(s.hotkey, "alt+x");
        assert!(!s.print_screen_notice_dismissed);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_magnifier_is_on_for_a_fresh_install_and_for_files_from_before_it_existed() {
        assert!(load(&temp_dir("fresh-magnifier")).magnifier);
        let dir = temp_dir("old-file");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","printScreenNoticeDismissed":true}"#).unwrap();
        let s = load(&dir);
        assert!(s.magnifier);
        assert_eq!((s.hotkey.as_str(), s.print_screen_notice_dismissed), ("alt+x", true));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_magnifier_is_stored_as_camel_case_magnifier_and_round_trips_both_ways() {
        let dir = temp_dir("magnifier-roundtrip");
        for value in [false, true] {
            let s = Settings { magnifier: value, ..Settings::default() };
            save(&dir, &s).unwrap();
            let text = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
            assert!(text.contains(&format!("\"magnifier\": {value}")), "{text}");
            assert_eq!(load(&dir).magnifier, value);
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn set_magnifier_saves_the_new_value() {
        let dir = temp_dir("set-magnifier");
        let mut s = Settings::default();
        assert!(set_magnifier(&dir, &mut s, false).is_ok());
        assert!(!s.magnifier);
        assert!(!load(&dir).magnifier);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn set_magnifier_keeps_the_value_in_memory_when_the_file_cannot_be_written() {
        // The "folder" is a regular file, so creating the folder and the temp file both fail.
        let blocker = temp_dir("blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(set_magnifier(&blocker, &mut s, false).is_err());
        assert!(!s.magnifier, "the overlay keeps working with the value for this run");
        fs::remove_file(&blocker).unwrap();
    }
}
