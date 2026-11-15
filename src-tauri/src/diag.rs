//! A small diagnostics log for the capture path: timestamped lines appended to `capture.log` in
//! the app data folder (Tauri's `app_data_dir`, the `<identifier>` folder, so the uninstaller's
//! "delete app data" option covers it; ADR 0003 / ticket 03). A windowed app has no console, so
//! this is the only way to see why a capture did nothing. No network, no dependencies.
//!
//! The file is capped: when a new line would push it past `LIMIT_BYTES` it is moved to
//! `capture.log.1` (replacing the previous one) and a fresh file starts, so the two together
//! never exceed twice the limit.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

pub const FILE_NAME: &str = "capture.log";
pub const LIMIT_BYTES: u64 = 200 * 1024;

pub struct Log {
    path: PathBuf,
    limit: u64,
    lock: Mutex<()>,
}

impl Log {
    pub fn new(dir: &Path, limit: u64) -> Log {
        Log { path: dir.join(FILE_NAME), limit, lock: Mutex::new(()) }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Append one line (stamped with `now_ms`, milliseconds since the Unix epoch, UTC). Never
    /// panics and never fails the caller: a log that cannot be written is silently skipped.
    pub fn write(&self, now_ms: u64, message: &str) {
        let line = format_line(now_ms, message);
        let _guard = self.lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(dir) = self.path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let size = fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0);
        if size > 0 && size + line.len() as u64 > self.limit {
            let mut old = self.path.clone().into_os_string();
            old.push(".1");
            let _ = fs::remove_file(&old);
            let _ = fs::rename(&self.path, &old);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&self.path) {
            let _ = file.write_all(line.as_bytes());
        }
    }
}

/// `YYYY-MM-DD HH:MM:SS.mmmZ message\n`, with the message kept on one line.
pub fn format_line(now_ms: u64, message: &str) -> String {
    let (secs, millis) = (now_ms / 1000, now_ms % 1000);
    let (year, month, day) = civil_from_days((secs / 86_400) as i64);
    let rem = secs % 86_400;
    let flat = message.replace("\r\n", " / ").replace(['\n', '\r'], " / ");
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02}.{millis:03}Z {flat}\n",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

/// Days since 1970-01-01 to a (year, month, day) in the proleptic Gregorian calendar.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

static GLOBAL: OnceLock<Log> = OnceLock::new();

/// Start logging into `dir` (the app data folder). Call once at startup.
pub fn init(dir: &Path) {
    let _ = GLOBAL.set(Log::new(dir, LIMIT_BYTES));
}

/// Where the log is, once `init` has run.
pub fn path() -> Option<PathBuf> {
    GLOBAL.get().map(|log| log.path().to_path_buf())
}

/// Log a line (also to stderr, for runs from a terminal).
pub fn log(message: &str) {
    eprintln!("{message}");
    if let Some(log) = GLOBAL.get() {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        log.write(now, message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("diag-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn lines_carry_a_utc_timestamp() {
        // 2024-02-29 13:04:05.678 UTC (a leap day)
        assert_eq!(format_line(1_709_211_845_678, "hello"), "2024-02-29 13:04:05.678Z hello\n");
        assert_eq!(format_line(0, "epoch"), "1970-01-01 00:00:00.000Z epoch\n");
    }

    #[test]
    fn a_message_stays_on_one_line() {
        assert_eq!(format_line(0, "a\nb\r\nc"), "1970-01-01 00:00:00.000Z a / b / c\n");
    }

    #[test]
    fn appends_and_creates_the_folder() {
        let dir = scratch("append").join("nested");
        let log = Log::new(&dir, LIMIT_BYTES);
        log.write(0, "one");
        log.write(1000, "two");
        let text = fs::read_to_string(log.path()).unwrap();
        assert_eq!(text, "1970-01-01 00:00:00.000Z one\n1970-01-01 00:00:01.000Z two\n");
    }

    #[test]
    fn rotates_instead_of_growing_past_the_cap() {
        let dir = scratch("rotate");
        let log = Log::new(&dir, 200);
        for i in 0..50 {
            log.write(i, &format!("line number {i} with some padding to fill the file"));
        }
        let size = fs::metadata(log.path()).unwrap().len();
        assert!(size <= 200, "current file is {size} bytes");
        let old = fs::metadata(dir.join("capture.log.1")).unwrap().len();
        assert!(old <= 200, "rotated file is {old} bytes");
        // The newest line is always in the current file.
        assert!(fs::read_to_string(log.path()).unwrap().contains("line number 49"));
    }

    #[test]
    fn an_unwritable_location_is_not_an_error() {
        // A file where the folder should be.
        let dir = scratch("blocked");
        fs::create_dir_all(&dir).unwrap();
        let blocker = dir.join("file");
        fs::write(&blocker, "x").unwrap();
        Log::new(&blocker, LIMIT_BYTES).write(0, "ignored");
    }
}
