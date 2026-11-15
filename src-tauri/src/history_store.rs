//! Undo history files (ticket 13): one small text file per image in `<app local data>/history/`,
//! named by a key the webview computes (the SHA-256 of the image's path, 64 hex characters).
//! The text is opaque here: its format, cap, hash check and 60-day rule live in the TypeScript
//! (`src/core/historyFile.ts`), which is unit tested. This module only stores, replaces atomically,
//! deletes and purges by file age. Pure std so the tests run anywhere (`rustc --test`).

use std::path::{Path, PathBuf};

/// Folder under the app's local data folder that holds the history files.
pub const HISTORY_FOLDER: &str = "history";

/// A key is exactly 64 lowercase hex characters, so it can never name a path outside the folder.
pub fn valid_key(key: &str) -> bool {
    key.len() == 64 && key.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn file_for(dir: &Path, key: &str) -> Result<PathBuf, String> {
    if valid_key(key) {
        Ok(dir.join(format!("{key}.json")))
    } else {
        Err("malformed history key".into())
    }
}

/// The stored text, or None when there is no file for `key`.
pub fn read(dir: &Path, key: &str) -> Result<Option<String>, String> {
    match std::fs::read_to_string(file_for(dir, key)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Replace the file for `key` atomically: a temp file in the same folder, flushed, then renamed over
/// the target (same approach as `library::write_atomic`; repeated so this file compiles standalone).
pub fn write(dir: &Path, key: &str, text: &str) -> Result<(), String> {
    use std::io::Write;
    let path = file_for(dir, key)?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let temp = dir.join(format!(".{key}.tmp"));
    let result = (|| {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&temp, &path)
    })();
    if let Err(e) = result {
        let _ = std::fs::remove_file(&temp);
        return Err(e.to_string());
    }
    Ok(())
}

/// Delete the file for `key`; fine if there is none.
pub fn delete(dir: &Path, key: &str) -> Result<(), String> {
    match std::fs::remove_file(file_for(dir, key)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Delete every history file last written before `cutoff_ms` (ms since the epoch), and any temp
/// file a crash left behind. Returns how many history files went. The cutoff comes from the webview
/// (`expiryCutoff`, unit tested with an injectable clock), so this holds no clock and no 60-day rule.
pub fn purge_before(dir: &Path, cutoff_ms: u64) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut purged = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') && name.ends_with(".tmp") {
            let _ = std::fs::remove_file(&path);
            continue;
        }
        if !name.ends_with(".json") || !path.is_file() {
            continue;
        }
        let modified_ms = path
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        if modified_ms.is_some_and(|m| m < cutoff_ms) && std::fs::remove_file(&path).is_ok() {
            purged += 1;
        }
    }
    purged
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const OTHER: &str = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sa-history-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn set_mtime_ms(path: &Path, ms: u64) {
        let file = std::fs::OpenOptions::new().write(true).open(path).unwrap();
        file.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_millis(ms)).unwrap();
    }

    #[test]
    fn only_64_lowercase_hex_characters_are_a_key() {
        assert!(valid_key(KEY));
        assert!(!valid_key(""));
        assert!(!valid_key(&KEY[1..]));
        assert!(!valid_key(&KEY.to_uppercase()));
        assert!(!valid_key(&format!("../{}", &KEY[3..])));
        assert!(!valid_key(&format!("{}g", &KEY[1..])));
    }

    #[test]
    fn a_bad_key_never_touches_the_disk() {
        let dir = scratch("badkey");
        assert!(write(&dir, "../evil", "x").is_err());
        assert!(read(&dir, "../evil").is_err());
        assert!(delete(&dir, "../evil").is_err());
        assert!(!dir.exists());
    }

    #[test]
    fn write_then_read_round_trips_and_replaces_without_leaving_a_temp_file() {
        let dir = scratch("roundtrip");
        assert_eq!(read(&dir, KEY), Ok(None));
        write(&dir, KEY, "first").unwrap();
        write(&dir, KEY, "second \u{1F600}").unwrap();
        assert_eq!(read(&dir, KEY), Ok(Some("second \u{1F600}".to_string())));
        let names: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(names.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_removes_the_file_and_is_fine_when_there_is_none() {
        let dir = scratch("delete");
        write(&dir, KEY, "x").unwrap();
        delete(&dir, KEY).unwrap();
        assert_eq!(read(&dir, KEY), Ok(None));
        delete(&dir, KEY).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn purge_removes_only_files_written_before_the_cutoff() {
        let dir = scratch("purge");
        write(&dir, KEY, "old").unwrap();
        write(&dir, OTHER, "new").unwrap();
        set_mtime_ms(&dir.join(format!("{KEY}.json")), 1_000);
        set_mtime_ms(&dir.join(format!("{OTHER}.json")), 5_000);
        std::fs::write(dir.join("notes.txt"), "not ours").unwrap();
        std::fs::write(dir.join(format!(".{KEY}.tmp")), "crash leftover").unwrap();

        assert_eq!(purge_before(&dir, 5_000), 1);

        assert_eq!(read(&dir, KEY), Ok(None));
        assert_eq!(read(&dir, OTHER), Ok(Some("new".to_string())));
        assert!(dir.join("notes.txt").exists());
        assert!(!dir.join(format!(".{KEY}.tmp")).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn purging_a_missing_folder_is_fine() {
        assert_eq!(purge_before(&scratch("missing"), u64::MAX), 0);
    }
}
