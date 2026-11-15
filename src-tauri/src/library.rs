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

/// `canonicalize` returns Windows paths as `\\?\C:\...`, which the shell's file operations reject;
/// drop that prefix for plain drive paths (`\\?\UNC\` paths are left alone).
pub fn without_verbatim_prefix(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with(r"UNC\") => PathBuf::from(rest),
        _ => path,
    }
}

/// The resolved path of `path` if it is an existing `.png` file strictly inside the Library `root`,
/// else None. The webview supplies discard paths, so both sides are resolved first (symlinks,
/// junctions and `..` followed to the real location) and the containment check runs on the result:
/// a link inside the Library that points outside is refused. The resolved path is what gets used.
pub fn library_file_in(root: &Path, path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() {
        return None;
    }
    let root = root.canonicalize().ok()?;
    let real = path.canonicalize().ok()?;
    let png = real.extension().is_some_and(|e| e.eq_ignore_ascii_case("png"));
    (png && real.is_file() && real != root && real.starts_with(&root)).then(|| without_verbatim_prefix(real))
}

/// A file name for the Save as PNG… dialog to suggest: letters, digits, space, `-`, `_` and `.` only.
pub fn dialog_file_name(requested: &str) -> String {
    let ok = !requested.is_empty()
        && requested
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.'))
        && !requested.starts_with('.');
    if ok { requested.to_string() } else { "capture.png".to_string() }
}

/// The path as UTF-16 ended by two NULs: the list format `SHFileOperationW` wants.
pub fn double_null_terminated(path: &Path) -> Vec<u16> {
    path.to_string_lossy().encode_utf16().chain([0, 0]).collect()
}

/// Move a file to the Windows Recycle Bin (recoverable, no dialogs). Windows only.
#[cfg(windows)]
pub fn move_to_recycle_bin(path: &Path) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
        SHFILEOPSTRUCTW,
    };
    let from = double_null_terminated(path);
    let mut op = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: PCWSTR(from.as_ptr()),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT).0 as u16,
        ..Default::default()
    };
    // SAFETY: `op` and the NUL-terminated `from` buffer outlive the call.
    let code = unsafe { SHFileOperationW(&mut op) };
    if code != 0 {
        Err(format!("could not move to the Recycle Bin (error {code:#x})"))
    } else if op.fAnyOperationsAborted.as_bool() {
        Err("moving to the Recycle Bin was cancelled".into())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
pub fn move_to_recycle_bin(_path: &Path) -> Result<(), String> {
    Err("the Recycle Bin is only available on Windows".into())
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

    fn touch(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"png").unwrap();
    }

    #[test]
    fn only_png_files_inside_the_library_may_be_discarded() {
        let root = scratch("guard");
        let file = root.join("2026-11").join("2026-11-15 134501.png");
        touch(&file);
        let resolved = library_file_in(&root, &file).expect("a Library png is allowed");
        assert_eq!(resolved, without_verbatim_prefix(file.canonicalize().unwrap()));

        let outside = root.parent().unwrap().join(format!("elsewhere-{}.png", std::process::id()));
        touch(&outside);
        let notes = root.join("2026-11").join("notes.txt");
        touch(&notes);
        for bad in [
            outside.clone(),
            root.clone(),
            notes,
            root.join("2026-11").join("missing.png"),
            PathBuf::from("2026-11/relative.png"),
        ] {
            assert_eq!(library_file_in(&root, &bad), None, "{bad:?}");
        }
        let _ = std::fs::remove_file(&outside);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn dot_dot_traversal_out_of_the_library_is_refused() {
        let root = scratch("dotdot");
        touch(&root.join("2026-11").join("a.png"));
        let outside = root.parent().unwrap().join(format!("traversal-{}.png", std::process::id()));
        touch(&outside);
        let sneaky = root
            .join("2026-11")
            .join("..")
            .join("..")
            .join(outside.file_name().unwrap());
        assert!(sneaky.exists(), "the traversal really reaches the outside file");
        assert_eq!(library_file_in(&root, &sneaky), None);
        // A `..` that stays inside still resolves to the real file.
        let inside = root.join("2026-11").join("..").join("2026-11").join("a.png");
        assert_eq!(
            library_file_in(&root, &inside),
            Some(without_verbatim_prefix(root.join("2026-11").join("a.png").canonicalize().unwrap()))
        );
        let _ = std::fs::remove_file(&outside);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_out_of_the_library_is_refused() {
        use std::os::unix::fs::symlink;
        let root = scratch("symlink");
        let outside_dir = scratch("symlink-outside");
        let target = outside_dir.join("precious.png");
        touch(&target);
        std::fs::create_dir_all(root.join("2026-11")).unwrap();

        // A png-named link to a file outside, and a link to a folder outside.
        let file_link = root.join("2026-11").join("link.png");
        symlink(&target, &file_link).unwrap();
        let dir_link = root.join("2026-12");
        symlink(&outside_dir, &dir_link).unwrap();

        assert_eq!(library_file_in(&root, &file_link), None);
        assert_eq!(library_file_in(&root, &dir_link.join("precious.png")), None);
        assert!(target.exists());
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[test]
    fn the_verbatim_prefix_is_dropped_for_the_shell() {
        assert_eq!(without_verbatim_prefix(PathBuf::from(r"\\?\C:\Pics\a.png")), PathBuf::from(r"C:\Pics\a.png"));
        assert_eq!(without_verbatim_prefix(PathBuf::from(r"\\?\UNC\srv\share\a.png")), PathBuf::from(r"\\?\UNC\srv\share\a.png"));
        assert_eq!(without_verbatim_prefix(PathBuf::from("/home/a.png")), PathBuf::from("/home/a.png"));
    }

    #[test]
    fn the_recycle_bin_path_list_is_double_null_terminated() {
        let wide = double_null_terminated(Path::new("C:\\a b\\c.png"));
        let expected: Vec<u16> = "C:\\a b\\c.png".encode_utf16().chain([0, 0]).collect();
        assert_eq!(wide, expected);
    }

    #[test]
    fn the_save_dialog_suggests_only_a_plain_file_name() {
        assert_eq!(dialog_file_name("2026-11-15 134501.png"), "2026-11-15 134501.png");
        for bad in ["", "..\\x.png", "a/b.png", "x.png\0", "con:.png"] {
            assert_eq!(dialog_file_name(bad), "capture.png", "{bad:?}");
        }
    }
}
