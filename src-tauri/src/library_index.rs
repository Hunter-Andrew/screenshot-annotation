//! The Library as a list (M3, tickets 14, 15 and 17): which PNGs are in `Pictures\Sigil (Screenshot Annotation)`
//! (the folder is the source of truth, ADR 0004), their pixel size, a cheap change signature the
//! webview polls, the file names of the disposable thumbnail cache, and the in-memory copies that make
//! Undo of a delete reliable. Pure std (plus `library.rs`), so the tests run anywhere.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::library;

/// A `.png` found in the Library, from file metadata only (no file is opened to produce this).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Scanned {
    pub path: PathBuf,
    pub modified_ms: u64,
    pub created_ms: Option<u64>,
    pub bytes: u64,
}

/// A scanned file plus the pixel size of its visible pixels (the finished image).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Listed {
    pub file: Scanned,
    pub width: u32,
    pub height: u32,
}

fn ms(time: std::time::SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Every `.png` in the Library: the root itself plus each month folder one level down, like
/// `library::latest_png`. Hidden names (starting with `.`, such as our own temp files) are skipped.
/// Sorted by path so the result is stable.
pub fn scan_pngs(root: &Path) -> Vec<Scanned> {
    let mut dirs = vec![root.to_path_buf()];
    if let Ok(entries) = std::fs::read_dir(root) {
        dirs.extend(entries.flatten().map(|e| e.path()).filter(|p| p.is_dir()));
    }
    let mut out: Vec<Scanned> = dirs
        .iter()
        .filter_map(|dir| std::fs::read_dir(dir).ok())
        .flat_map(|entries| entries.flatten())
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_string_lossy().into_owned();
            let png = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("png"));
            if !png || name.starts_with('.') {
                return None;
            }
            let meta = entry.metadata().ok().filter(|m| m.is_file())?;
            Some(Scanned {
                path,
                modified_ms: meta.modified().map(ms).unwrap_or(0),
                created_ms: meta.created().ok().map(ms),
                bytes: meta.len(),
            })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

/// FNV-1a, 64 bit. Unlike `DefaultHasher` its output is specified and never changes between Rust
/// versions, so cache file names (and so the thumbnail cache) survive an upgrade.
pub fn fnv1a(parts: &[&[u8]]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for part in parts {
        for byte in *part {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        // A separator, so ("ab", "c") and ("a", "bc") differ.
        hash ^= 0xff;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// A value that changes whenever a file is added, removed, replaced or edited in the Library. From
/// metadata alone, so the webview can poll it cheaply (the folder watch of ticket 17).
pub fn signature(files: &[Scanned]) -> String {
    let mut hash = fnv1a(&[]);
    for f in files {
        let path = f.path.to_string_lossy().to_lowercase();
        hash ^= fnv1a(&[path.as_bytes(), &f.modified_ms.to_le_bytes(), &f.bytes.to_le_bytes()]);
        hash = hash.rotate_left(5).wrapping_mul(0x100000001b3);
    }
    format!("{}:{hash:016x}", files.len())
}

/// Width and height from a PNG's first bytes (signature, then the IHDR chunk). None if the bytes
/// are not the start of a PNG.
pub fn png_size(head: &[u8]) -> Option<(u32, u32)> {
    const SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
    if head.len() < 24 || head[..8] != SIGNATURE || &head[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes(head[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(head[20..24].try_into().ok()?);
    (width > 0 && height > 0).then_some((width, height))
}

/// Remembers the pixel size of files already read, so a rescan only opens new or changed files.
#[derive(Default)]
pub struct SizeCache(HashMap<(PathBuf, u64, u64), (u32, u32)>);

fn read_head(path: &Path) -> Option<Vec<u8>> {
    use std::io::Read;
    let mut head = vec![0u8; 24];
    std::fs::File::open(path).ok()?.read_exact(&mut head).ok()?;
    Some(head)
}

/// The Library as a list. Files that are not PNGs (a damaged file, or another format named `.png`)
/// are left out rather than shown broken. The order is stable (by path); the webview sorts it.
pub fn list_library(root: &Path, cache: &mut SizeCache) -> Vec<Listed> {
    let listed: Vec<Listed> = scan_pngs(root)
        .into_iter()
        .filter_map(|file| {
            let key = (file.path.clone(), file.modified_ms, file.bytes);
            let (width, height) = match cache.0.get(&key) {
                Some(size) => *size,
                None => png_size(&read_head(&file.path)?)?,
            };
            cache.0.insert(key, (width, height));
            Some(Listed { file, width, height })
        })
        .collect();
    // Forget files that are gone, so the cache never outgrows the Library.
    let live: HashSet<&PathBuf> = listed.iter().map(|l| &l.file.path).collect();
    cache.0.retain(|(path, _, _), _| live.contains(path));
    listed
}

/// The cache file name for a thumbnail of `file`: it changes when the file does (a new modification
/// time or size), so a stale thumbnail is never shown and an unchanged one is reused across restarts
/// and upgrades. `edge` is part of the name so a new thumbnail size starts a fresh cache.
pub fn thumbnail_name(file: &Scanned, edge: u32) -> String {
    let path = file.path.to_string_lossy().to_lowercase();
    let hash = fnv1a(&[path.as_bytes(), &file.modified_ms.to_le_bytes(), &file.bytes.to_le_bytes(), &edge.to_le_bytes()]);
    format!("{hash:016x}-{edge}.png")
}

/// Delete cache files that no Library file needs any more. `keep` is every current `thumbnail_name`.
/// Only touches `.png` files directly in `dir`. Returns how many were deleted.
pub fn prune_thumbnails(dir: &Path, keep: &HashSet<String>) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            name.ends_with(".png") && !keep.contains(&name)
        })
        .filter(|e| std::fs::remove_file(e.path()).is_ok())
        .count()
}

// --- Undo of a delete -----------------------------------------------------------------------------

/// Copies of the files just moved to the Recycle Bin, held in memory until the Undo notice is gone.
/// Undo writes them back from here: restoring from the Recycle Bin through the shell cannot be
/// verified off the work laptop, and a failed Undo would lose the image.
#[derive(Default)]
pub struct TrashStash {
    files: Vec<Stashed>,
}

struct Stashed {
    /// The path as the webview named it; Undo is asked for the same strings.
    key: String,
    /// The resolved path the file really had.
    path: PathBuf,
    bytes: Vec<u8>,
}

impl TrashStash {
    pub fn add(&mut self, key: String, path: PathBuf, bytes: Vec<u8>) {
        self.files.retain(|f| f.key != key);
        self.files.push(Stashed { key, path, bytes });
    }

    /// Drop the copies for `keys` (the Undo notice expired or was replaced).
    pub fn forget(&mut self, keys: &[String]) {
        self.files.retain(|f| !keys.contains(&f.key));
    }

    /// Write the copies for `keys` back into the Library. A file whose old name is taken again gets a
    /// `-2`, `-3` suffix. Returns `(key, restored path)` for each one restored; a failure leaves that
    /// copy stashed so Undo can be tried again.
    pub fn restore(&mut self, keys: &[String]) -> Vec<(String, PathBuf)> {
        let mut restored = Vec::new();
        for key in keys {
            let Some(index) = self.files.iter().position(|f| &f.key == key) else { continue };
            let file = &self.files[index];
            if let Ok(path) = restore_file(&file.path, &file.bytes) {
                restored.push((key.clone(), path));
                self.files.remove(index);
            }
        }
        restored
    }
}

/// Write `bytes` back at `path`, or beside it under a free name if something is there now.
pub fn restore_file(path: &Path, bytes: &[u8]) -> std::io::Result<PathBuf> {
    let target = if path.exists() {
        let dir = path.parent().expect("library paths have a parent");
        let stem = path.file_stem().expect("library paths have a name").to_string_lossy().into_owned();
        library::unique_path(dir, &stem, |p| p.exists())
    } else {
        path.to_path_buf()
    };
    library::write_atomic(&target, bytes)?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sa-index-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// The first 24 bytes of a PNG of the given size (signature + IHDR header), padded like a small file.
    fn png_head(width: u32, height: u32) -> Vec<u8> {
        let mut out = vec![137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];
        out.extend_from_slice(b"IHDR");
        out.extend_from_slice(&width.to_be_bytes());
        out.extend_from_slice(&height.to_be_bytes());
        out.extend_from_slice(&[8, 6, 0, 0, 0]);
        out
    }

    fn put(dir: &Path, rel: &str, bytes: &[u8]) -> PathBuf {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn png_size_reads_the_header_and_refuses_anything_else() {
        assert_eq!(png_size(&png_head(1920, 1080)), Some((1920, 1080)));
        assert_eq!(png_size(&png_head(0, 5)), None);
        assert_eq!(png_size(b"GIF89a not a png at all"), None);
        assert_eq!(png_size(&png_head(3, 3)[..20]), None);
    }

    #[test]
    fn the_scan_finds_pngs_in_the_root_and_month_folders_only() {
        let root = scratch("scan");
        put(&root, "2026-11/2026-11-15 134501.png", &png_head(4, 3));
        put(&root, "2026-10/a.PNG", &png_head(4, 3));
        put(&root, "dropped.png", &png_head(4, 3));
        put(&root, "2026-11/notes.txt", b"x");
        put(&root, "2026-11/.2026-11-15 134501.png.tmp", b"x");
        put(&root, "2026-11/.hidden.png", &png_head(4, 3));
        put(&root, "2026-11/deeper/too-deep.png", &png_head(4, 3));
        let names: Vec<String> = scan_pngs(&root)
            .iter()
            .map(|f| f.path.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/"))
            .collect();
        assert_eq!(names, ["2026-10/a.PNG", "2026-11/2026-11-15 134501.png", "dropped.png"]);
    }

    #[test]
    fn a_missing_library_is_empty() {
        let root = scratch("missing").join("nope");
        assert!(scan_pngs(&root).is_empty());
        assert!(list_library(&root, &mut SizeCache::default()).is_empty());
    }

    #[test]
    fn the_list_carries_pixel_sizes_and_leaves_out_files_that_are_not_pngs() {
        let root = scratch("list");
        put(&root, "2026-11/one.png", &png_head(640, 480));
        put(&root, "2026-11/two.png", &png_head(10, 20));
        put(&root, "2026-11/fake.png", b"this is not a png file, just text, long enough");
        put(&root, "2026-11/tiny.png", b"x");
        let listed = list_library(&root, &mut SizeCache::default());
        let sizes: Vec<(String, u32, u32)> = listed
            .iter()
            .map(|l| (l.file.path.file_name().unwrap().to_string_lossy().into_owned(), l.width, l.height))
            .collect();
        assert_eq!(sizes, [("one.png".to_string(), 640, 480), ("two.png".to_string(), 10, 20)]);
        assert!(listed[0].file.bytes > 0 && listed[0].file.modified_ms > 0);
    }

    #[test]
    fn a_rescan_does_not_reopen_files_it_has_already_measured() {
        let root = scratch("cache");
        let path = put(&root, "2026-11/one.png", &png_head(640, 480));
        let mut cache = SizeCache::default();
        assert_eq!(list_library(&root, &mut cache)[0].width, 640);
        // Same length and (within the test) the same time: the cached size is used, which proves no re-read.
        let before = std::fs::metadata(&path).unwrap().modified().unwrap();
        std::fs::write(&path, png_head(1, 1)).unwrap();
        let file = std::fs::File::options().write(true).open(&path).unwrap();
        file.set_modified(before).unwrap();
        assert_eq!(list_library(&root, &mut cache)[0].width, 640);
        // A deleted file leaves the cache.
        std::fs::remove_file(&path).unwrap();
        assert!(list_library(&root, &mut cache).is_empty());
        assert!(cache.0.is_empty());
    }

    #[test]
    fn the_signature_changes_on_add_remove_and_edit_and_not_otherwise() {
        let root = scratch("signature");
        let a = put(&root, "2026-11/a.png", &png_head(4, 3));
        let first = signature(&scan_pngs(&root));
        assert_eq!(first, signature(&scan_pngs(&root)));

        put(&root, "2026-11/b.png", &png_head(4, 3));
        let added = signature(&scan_pngs(&root));
        assert_ne!(first, added);

        let mut longer = png_head(4, 3);
        longer.extend_from_slice(b"more");
        std::fs::write(&a, longer).unwrap();
        let edited = signature(&scan_pngs(&root));
        assert_ne!(added, edited);

        std::fs::remove_file(&a).unwrap();
        assert_ne!(edited, signature(&scan_pngs(&root)));
        assert_ne!(signature(&[]), added);
    }

    #[test]
    fn fnv1a_has_fixed_known_values_and_separates_parts() {
        // Pinned values: if these ever change, every user's thumbnail cache is rebuilt, so a change must be deliberate.
        assert_eq!(fnv1a(&[]), 0xcbf29ce484222325, "the FNV-1a offset basis");
        assert_eq!(fnv1a(&[b"hello"]), 0xa9bd73cca220c59c);
        assert_ne!(fnv1a(&[b"ab", b"c"]), fnv1a(&[b"a", b"bc"]));
    }

    fn scanned(path: &str, modified_ms: u64, bytes: u64) -> Scanned {
        Scanned { path: PathBuf::from(path), modified_ms, created_ms: None, bytes }
    }

    #[test]
    fn a_thumbnail_name_follows_the_file_its_time_size_and_the_thumbnail_edge() {
        let base = thumbnail_name(&scanned("C:\\Pics\\a.png", 100, 5), 460);
        assert_eq!(base, thumbnail_name(&scanned("c:\\pics\\A.PNG", 100, 5), 460), "paths compare without case, like Windows");
        assert_ne!(base, thumbnail_name(&scanned("C:\\Pics\\a.png", 101, 5), 460));
        assert_ne!(base, thumbnail_name(&scanned("C:\\Pics\\a.png", 100, 6), 460));
        assert_ne!(base, thumbnail_name(&scanned("C:\\Pics\\a.png", 100, 5), 230));
        assert_ne!(base, thumbnail_name(&scanned("C:\\Pics\\b.png", 100, 5), 460));
        assert!(base.ends_with("-460.png") && base.len() == 16 + "-460.png".len());
    }

    #[test]
    fn pruning_deletes_only_cache_files_nothing_needs() {
        let dir = scratch("prune");
        put(&dir, "keep-1.png", b"x");
        put(&dir, "old-2.png", b"x");
        put(&dir, "notes.txt", b"x");
        let keep: HashSet<String> = ["keep-1.png".to_string()].into();
        assert_eq!(prune_thumbnails(&dir, &keep), 1);
        assert!(dir.join("keep-1.png").exists() && dir.join("notes.txt").exists() && !dir.join("old-2.png").exists());
        assert_eq!(prune_thumbnails(&dir.join("missing"), &keep), 0);
    }

    #[test]
    fn undo_puts_the_stashed_files_back_where_they_were() {
        let root = scratch("undo");
        let path = root.join("2026-11").join("a.png");
        let mut stash = TrashStash::default();
        stash.add("k".into(), path.clone(), b"bytes-a".to_vec());
        assert!(!path.exists());

        let restored = stash.restore(&["k".into()]);
        assert_eq!(restored, vec![("k".to_string(), path.clone())]);
        assert_eq!(std::fs::read(&path).unwrap(), b"bytes-a");
        // Once restored it is not restored twice.
        assert!(stash.restore(&["k".into()]).is_empty());
    }

    #[test]
    fn undo_never_overwrites_a_file_that_took_the_name() {
        let root = scratch("undo-taken");
        let path = put(&root, "2026-11/a.png", b"newer");
        let mut stash = TrashStash::default();
        stash.add("k".into(), path.clone(), b"older".to_vec());
        let restored = stash.restore(&["k".into()]);
        assert_eq!(restored[0].1, root.join("2026-11").join("a-2.png"));
        assert_eq!(std::fs::read(&path).unwrap(), b"newer");
        assert_eq!(std::fs::read(&restored[0].1).unwrap(), b"older");
    }

    #[test]
    fn forgotten_copies_cannot_be_restored_and_unknown_keys_are_ignored() {
        let root = scratch("forget");
        let a = root.join("a.png");
        let b = root.join("b.png");
        let mut stash = TrashStash::default();
        stash.add("a".into(), a.clone(), b"a".to_vec());
        stash.add("b".into(), b.clone(), b"b".to_vec());
        stash.forget(&["a".into()]);
        let restored = stash.restore(&["a".into(), "b".into(), "zzz".into()]);
        assert_eq!(restored, vec![("b".to_string(), b)]);
        assert!(!a.exists());
    }

    #[test]
    fn a_restore_that_fails_keeps_the_copy_for_another_try() {
        let root = scratch("retry");
        // The folder cannot be created because a FILE is where the month folder should be.
        let blocker = put(&root, "2026-11", b"i am a file");
        let path = blocker.join("a.png");
        let mut stash = TrashStash::default();
        stash.add("k".into(), path.clone(), b"x".to_vec());
        assert!(stash.restore(&["k".into()]).is_empty());
        std::fs::remove_file(&blocker).unwrap();
        assert_eq!(stash.restore(&["k".into()]).len(), 1);
    }
}
