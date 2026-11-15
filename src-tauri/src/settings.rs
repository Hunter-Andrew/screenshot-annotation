//! App settings, stored as `settings.json` under Tauri's `app_data_dir` (the `<identifier>` folder
//! under %APPDATA%) so the installer's upgrade and "delete app data" behavior covers them (ticket 03).
//! Later tickets add their own fields; `#[serde(default)]` keeps older files loading.

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
}

impl Default for Settings {
    fn default() -> Self {
        Settings { hotkey: DEFAULT_HOTKEY.into(), print_screen_notice_dismissed: false }
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
        let s = Settings { hotkey: "PrintScreen".into(), print_screen_notice_dismissed: true };
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
}
