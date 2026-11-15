//! Library file I/O (ADR 0004): `Pictures\Screenshot Annotation\YYYY-MM\YYYY-MM-DD HHmmss.png`,
//! a `-2`, `-3`... suffix on a name collision, and atomic writes (temp file, then replace).
//! Pure std so the tests run anywhere.

use std::path::{Path, PathBuf};

/// Folder under the user's Pictures folder that holds the Library.
pub const LIBRARY_FOLDER: &str = "Screenshot Annotation";

/// A capture time in local time, formatted `YYYY-MM-DD HHmmss` (the file name without extension).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stamp(String);

impl Stamp {
    /// Accepts only the exact `YYYY-MM-DD HHmmss` shape, which also keeps path separators and
    /// `..` out of file names.
    pub fn parse(text: &str) -> Option<Stamp> {
        let b = text.as_bytes();
        let ok = b.len() == 17
            && b.iter().enumerate().all(|(i, c)| match i {
                4 | 7 => *c == b'-',
                10 => *c == b' ',
                _ => c.is_ascii_digit(),
            });
        if !ok {
            return None;
        }
        let month: u32 = text[5..7].parse().ok()?;
        let day: u32 = text[8..10].parse().ok()?;
        let (h, m, s): (u32, u32, u32) = (
            text[11..13].parse().ok()?,
            text[13..15].parse().ok()?,
            text[15..17].parse().ok()?,
        );
        if !(1..=12).contains(&month) || !(1..=31).contains(&day) || h > 23 || m > 59 || s > 60 {
            return None;
        }
        Some(Stamp(text.to_string()))
    }

    /// `YYYY-MM`, the month folder.
    pub fn month_folder(&self) -> &str {
        &self.0[..7]
    }

    pub fn file_stem(&self) -> &str {
        &self.0
    }
}

/// First free path for `stem` in `dir`: `stem.png`, then `stem-2.png`, `stem-3.png`...
pub fn unique_path(dir: &Path, stem: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(format!("{stem}.png"));
    if !exists(&first) {
        return first;
    }
    (2u32..)
        .map(|n| dir.join(format!("{stem}-{n}.png")))
        .find(|p| !exists(p))
        .expect("an unused name exists")
}

/// Write `bytes` to `path` atomically: a temp file in the same folder, flushed, then renamed
/// over the target (which replaces an existing file). A crash leaves the old file or none, never half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let dir = path.parent().expect("library paths have a parent");
    std::fs::create_dir_all(dir)?;
    let name = path.file_name().expect("library paths have a name").to_string_lossy();
    let temp = dir.join(format!(".{name}.tmp"));
    let result = (|| {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

/// Save a new Library PNG under `root` (the Library folder) for `stamp`, never overwriting an
/// existing file. Returns the path written.
pub fn save_new(root: &Path, stamp: &Stamp, bytes: &[u8]) -> std::io::Result<PathBuf> {
    let dir = root.join(stamp.month_folder());
    std::fs::create_dir_all(&dir)?;
    let path = unique_path(&dir, stamp.file_stem(), |p| p.exists());
    write_atomic(&path, bytes)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sa-library-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn stamp_names_the_month_folder_and_file() {
        let stamp = Stamp::parse("2026-11-15 134501").unwrap();
        assert_eq!(stamp.month_folder(), "2026-11");
        assert_eq!(stamp.file_stem(), "2026-11-15 134501");
    }

    #[test]
    fn stamp_refuses_anything_else() {
        for bad in ["", "2026-11-15 13:45:01", "../../x", "2026-13-15 134501", "2026-11-15 244501", "2026-11-15 134501\\x"] {
            assert_eq!(Stamp::parse(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn collisions_get_a_2_then_3_suffix() {
        let taken = ["a/2026-11-15 134501.png", "a/2026-11-15 134501-2.png"];
        let exists = |p: &Path| taken.iter().any(|t| Path::new(t) == p);
        let path = unique_path(Path::new("a"), "2026-11-15 134501", exists);
        assert_eq!(path, Path::new("a/2026-11-15 134501-3.png"));
        assert_eq!(
            unique_path(Path::new("a"), "other", exists),
            Path::new("a/other.png")
        );
    }

    #[test]
    fn save_new_writes_into_the_month_folder_and_suffixes_on_collision() {
        let root = scratch("save-new");
        let stamp = Stamp::parse("2026-11-15 134501").unwrap();

        let first = save_new(&root, &stamp, b"one").unwrap();
        let second = save_new(&root, &stamp, b"two").unwrap();

        assert_eq!(first, root.join("2026-11").join("2026-11-15 134501.png"));
        assert_eq!(second, root.join("2026-11").join("2026-11-15 134501-2.png"));
        assert_eq!(std::fs::read(&first).unwrap(), b"one");
        assert_eq!(std::fs::read(&second).unwrap(), b"two");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn write_atomic_replaces_the_file_and_leaves_no_temp_file() {
        let root = scratch("atomic");
        let path = root.join("x.png");
        std::fs::write(&path, b"old").unwrap();

        write_atomic(&path, b"new contents").unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), b"new contents");
        let names: Vec<_> = std::fs::read_dir(&root).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("x.png")]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_failed_write_keeps_the_old_file() {
        let root = scratch("failed");
        let path = root.join("x.png");
        std::fs::write(&path, b"old").unwrap();
        // A directory squatting on the temp name makes File::create fail before anything is replaced.
        std::fs::create_dir(root.join(".x.png.tmp")).unwrap();

        assert!(write_atomic(&path, b"new").is_err());

        assert_eq!(std::fs::read(&path).unwrap(), b"old");
        let _ = std::fs::remove_dir_all(&root);
    }
}
