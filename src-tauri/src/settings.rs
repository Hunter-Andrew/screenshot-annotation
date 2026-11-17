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
//! - `toolStyles`: each drawing tool's last style (color, thickness, fill...), so the next Annotation
//!   you draw with that tool starts the way you left it. One entry per tool ("arrow", "rect"...). The
//!   editor writes and checks it; a missing or unreadable entry just means that tool uses its default.
//!   Deleting the whole field (with the app closed) resets every tool to its default style.
//! - `launchAtSignIn`: true (the default, also when the field is missing) starts the app in the tray when
//!   you sign in to Windows, through a value in the per-user Run key. Change it in Settings.
//! - `trayNoticeShown`: true once the one-time "still running in the tray" message, shown the first time
//!   the editor is closed, has been shown. Setting it back to false (with the app closed) shows it once more.

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const FILE_NAME: &str = "settings.json";
/// Where an unparseable settings.json is kept (see `load`).
pub const CORRUPT_FILE_NAME: &str = "settings.json.corrupt";
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
    /// Each drawing tool's last style, by Annotation type. The platform does not look inside: the
    /// editor owns the shape (and validates it on read), so a new tool or group needs no change here.
    #[serde(deserialize_with = "object_or_empty")]
    pub tool_styles: serde_json::Map<String, serde_json::Value>,
    /// Start the app when the user signs in to Windows (default true), through the HKCU Run key.
    pub launch_at_sign_in: bool,
    /// The one-time "still running in the tray" notice, shown the first time the editor is closed, was shown.
    pub tray_notice_shown: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            hotkey: DEFAULT_HOTKEY.into(),
            print_screen_notice_dismissed: false,
            magnifier: true,
            tool_styles: serde_json::Map::new(),
            launch_at_sign_in: true,
            tray_notice_shown: false,
        }
    }
}

/// A hand-edited `"toolStyles": 5` must not cost the user their hotkey: anything but an object is empty.
fn object_or_empty<'de, D>(d: D) -> Result<serde_json::Map<String, serde_json::Value>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    })
}

/// Loads the settings; a missing file gives the defaults. A file that exists but cannot be parsed
/// also gives the defaults, but is first copied to `settings.json.corrupt` (one copy, an older one is
/// overwritten) so the next save does not destroy the user's hotkey and other choices.
pub fn load(dir: &Path) -> Settings {
    let Ok(bytes) = fs::read(dir.join(FILE_NAME)) else { return Settings::default() };
    match serde_json::from_slice(&bytes) {
        Ok(settings) => settings,
        Err(parse_error) => {
            let outcome = match fs::write(dir.join(CORRUPT_FILE_NAME), &bytes) {
                Ok(()) => format!("a copy was kept as {CORRUPT_FILE_NAME}"),
                Err(e) => format!("could not keep a copy as {CORRUPT_FILE_NAME}: {e}"),
            };
            crate::diag::log(&format!("settings.json could not be read ({parse_error}); using defaults; {outcome}"));
            Settings::default()
        }
    }
}

/// Writes `bytes` to `path` and flushes them to disk before returning, so a rename that follows
/// cannot leave an empty or partial file after a power cut.
fn write_durably(path: &Path, bytes: &[u8]) -> io::Result<()> {
    use std::io::Write;
    let mut file = fs::File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

/// Saves the settings atomically (temp file flushed to disk, then rename).
pub fn save(dir: &Path, settings: &Settings) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    write_durably(&tmp, &serde_json::to_vec_pretty(settings)?)?;
    fs::rename(&tmp, dir.join(FILE_NAME))
}

/// Sets the magnifier value and then tries to save. The in-memory value changes even when the
/// write fails (the overlay keeps working this run); the error is returned for the caller to log.
pub fn set_magnifier(dir: &Path, settings: &mut Settings, enabled: bool) -> io::Result<()> {
    settings.magnifier = enabled;
    save(dir, settings)
}

/// Replaces the stored tool styles and then tries to save; like `set_magnifier`, the in-memory value
/// changes even when the write fails.
pub fn set_tool_styles(
    dir: &Path,
    settings: &mut Settings,
    styles: serde_json::Map<String, serde_json::Value>,
) -> io::Result<()> {
    settings.tool_styles = styles;
    save(dir, settings)
}

/// Sets "launch at sign-in" and then tries to save; like `set_magnifier`, the in-memory value changes
/// even when the write fails.
pub fn set_launch_at_sign_in(dir: &Path, settings: &mut Settings, enabled: bool) -> io::Result<()> {
    settings.launch_at_sign_in = enabled;
    save(dir, settings)
}

/// Forgets every sticky tool style (and the per-tool choices stored beside them) and tries to save.
pub fn reset_tool_styles(dir: &Path, settings: &mut Settings) -> io::Result<()> {
    settings.tool_styles = serde_json::Map::new();
    save(dir, settings)
}

/// True exactly once: the first time the editor is closed to the tray. Records that the notice was
/// shown (in memory at once, then on disk; a failed write only means it may be shown once more after a restart).
pub fn take_tray_notice(dir: &Path, settings: &mut Settings) -> bool {
    if settings.tray_notice_shown {
        return false;
    }
    settings.tray_notice_shown = true;
    let _ = save(dir, settings);
    true
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
        let s = Settings {
            hotkey: "PrintScreen".into(),
            print_screen_notice_dismissed: true,
            magnifier: false,
            ..Settings::default()
        };
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
    fn a_corrupt_file_is_kept_aside_as_settings_json_corrupt_and_defaults_load() {
        let dir = temp_dir("corrupt-aside");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x", oops"#).unwrap();
        assert_eq!(load(&dir), Settings::default());
        assert_eq!(fs::read(dir.join(CORRUPT_FILE_NAME)).unwrap(), br#"{"hotkey":"alt+x", oops"#);
        // A later save overwrites settings.json, but the copy survives.
        save(&dir, &Settings::default()).unwrap();
        assert_eq!(fs::read(dir.join(CORRUPT_FILE_NAME)).unwrap(), br#"{"hotkey":"alt+x", oops"#);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_one_corrupt_copy_is_kept_the_newest() {
        let dir = temp_dir("corrupt-newest");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), b"first {").unwrap();
        load(&dir);
        fs::write(dir.join(FILE_NAME), b"second {").unwrap();
        load(&dir);
        assert_eq!(fs::read(dir.join(CORRUPT_FILE_NAME)).unwrap(), b"second {");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_normal_or_missing_file_is_not_copied_aside() {
        let dir = temp_dir("no-copy");
        load(&dir);
        assert!(!dir.join(CORRUPT_FILE_NAME).exists());
        save(&dir, &Settings::default()).unwrap();
        load(&dir);
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","toolStyles":5}"#).unwrap();
        load(&dir);
        assert!(!dir.join(CORRUPT_FILE_NAME).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn write_durably_writes_the_bytes_and_replaces_an_older_file() {
        let dir = temp_dir("durable");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.tmp");
        write_durably(&path, b"old old old").unwrap();
        write_durably(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
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

    fn styles(json: &str) -> serde_json::Map<String, serde_json::Value> {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn files_from_before_tool_styles_existed_load_with_none_and_keep_their_other_fields() {
        let dir = temp_dir("old-no-styles");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","magnifier":false}"#).unwrap();
        let s = load(&dir);
        assert!(s.tool_styles.is_empty());
        assert_eq!((s.hotkey.as_str(), s.magnifier), ("alt+x", false));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn tool_styles_are_stored_as_camel_case_toolstyles_and_round_trip_untouched() {
        let dir = temp_dir("styles-roundtrip");
        let mut s = Settings::default();
        let wanted = styles(r##"{"rect":{"stroke":{"color":"#2563eb","width":8},"fill":{"mode":"semi","color":"#facc15","opacity":0.4}}}"##);
        set_tool_styles(&dir, &mut s, wanted.clone()).unwrap();
        let text = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
        assert!(text.contains("\"toolStyles\""), "{text}");
        assert_eq!(load(&dir).tool_styles, wanted);
        // The other settings are written alongside, unchanged.
        assert_eq!(load(&dir).hotkey, DEFAULT_HOTKEY);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_tool_styles_field_that_is_not_an_object_costs_nothing_else() {
        let dir = temp_dir("styles-wrong-type");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","toolStyles":5}"#).unwrap();
        let s = load(&dir);
        assert!(s.tool_styles.is_empty());
        assert_eq!(s.hotkey, "alt+x");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn set_tool_styles_keeps_the_value_in_memory_when_the_file_cannot_be_written() {
        let blocker = temp_dir("styles-blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(set_tool_styles(&blocker, &mut s, styles(r#"{"line":{}}"#)).is_err());
        assert!(s.tool_styles.contains_key("line"));
        fs::remove_file(&blocker).unwrap();
    }

    #[test]
    fn launch_at_sign_in_is_on_by_default_and_for_files_from_before_it_existed() {
        assert!(Settings::default().launch_at_sign_in);
        let dir = temp_dir("launch-old-file");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        assert!(load(&dir).launch_at_sign_in);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn turning_launch_at_sign_in_off_is_saved_and_leaves_the_rest_alone() {
        let dir = temp_dir("launch-off");
        let mut s = Settings { hotkey: "alt+x".into(), ..Settings::default() };
        set_launch_at_sign_in(&dir, &mut s, false).unwrap();
        let back = load(&dir);
        assert!(!back.launch_at_sign_in);
        assert_eq!(back.hotkey, "alt+x");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn launch_at_sign_in_keeps_the_new_value_in_memory_when_the_file_cannot_be_written() {
        let blocker = temp_dir("launch-blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(set_launch_at_sign_in(&blocker, &mut s, false).is_err());
        assert!(!s.launch_at_sign_in);
        fs::remove_file(&blocker).unwrap();
    }

    #[test]
    fn reset_tool_styles_clears_every_sticky_style_and_nothing_else() {
        let dir = temp_dir("reset-styles");
        let mut s = Settings { hotkey: "alt+x".into(), magnifier: false, ..Settings::default() };
        set_tool_styles(&dir, &mut s, styles(r#"{"rect":{"stroke":{"width":8}},"toolBehavior":{"pen":true}}"#)).unwrap();
        reset_tool_styles(&dir, &mut s).unwrap();
        let back = load(&dir);
        assert!(back.tool_styles.is_empty());
        assert_eq!(back.hotkey, "alt+x");
        assert!(!back.magnifier);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_tray_notice_is_taken_once_and_stays_taken_after_a_restart() {
        let dir = temp_dir("tray-notice");
        let mut s = Settings::default();
        assert!(!s.tray_notice_shown);
        assert!(take_tray_notice(&dir, &mut s));
        assert!(!take_tray_notice(&dir, &mut s));
        let mut after_restart = load(&dir);
        assert!(after_restart.tray_notice_shown);
        assert!(!take_tray_notice(&dir, &mut after_restart));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_tray_notice_that_could_not_be_recorded_is_not_repeated_in_the_same_run() {
        let blocker = temp_dir("tray-notice-blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(take_tray_notice(&blocker, &mut s));
        assert!(!take_tray_notice(&blocker, &mut s));
        fs::remove_file(&blocker).unwrap();
    }
}
