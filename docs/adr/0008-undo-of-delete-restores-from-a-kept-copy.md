---
status: accepted
---

# Undo of a delete writes the file back from a copy the app keeps; the Recycle Bin keeps its own

Every delete from the Library Strip, the grid or Discard moves the file to the Windows Recycle Bin with no confirmation, and an Undo notice (8 seconds) offers a way back. The app does not ask the shell to restore the item from the Recycle Bin. Before moving a file it reads it into memory; Undo writes those bytes back to the file's old path (or to a `-2` name if something took that name since) and the copy is dropped when the notice ends or a newer delete replaces it. Restoring through the shell means enumerating the Recycle Bin and running its "undelete" verb: COM code that cannot be run or checked anywhere but the work laptop, where a bug would silently lose the image the user just asked to get back. Writing bytes is plain file I/O with Rust tests (`library_index.rs`).

The consequence the user may notice: after Undo the Recycle Bin still holds the deleted copy. It is a harmless duplicate that Windows empties like any other item, and it is also the safety net if Undo itself fails. If the app is closed or crashes while a notice is showing, nothing is lost: the file is in the Recycle Bin, restorable by hand.

An image's undo history (ADR 0004: kept in local app data, never in the PNG) is deleted when the notice ends, not at the moment of the delete, so Undo brings the image back with its history. Leftovers from a closed app are removed by the existing 60-day expiry.

## Considered Options

- **Restore from the Recycle Bin through the shell:** matches "Undo restores the file from the Recycle Bin" literally and leaves no duplicate. Rejected for now because it cannot be verified off the laptop; it can replace the kept copy later without changing the bridge (`restoreLibraryFiles`).
- **Delete permanently, keeping only the in-memory copy:** rejected; the spec requires the Recycle Bin.
- **Confirm before deleting:** rejected by the spec (stories 95 and 99): deleting should be quick but recoverable.

## Also decided with M3

- **The folder is followed by polling, not a file-system watcher.** The webview asks for a cheap change signature (names, sizes and times of the PNGs, nothing opened) every 2 seconds while the window is visible, and once more whenever the window is shown or focused. It needs no extra dependency and behaves the same on a OneDrive-synced Pictures folder. A watcher can replace it behind `onLibraryChanged`.
- **Thumbnails are made in Rust and cached in `%LOCALAPPDATA%\<app id>\thumbnails`**, keyed by path, modification time, size and thumbnail size with a fixed hash (so the cache survives upgrades). One 460 px thumbnail serves the strip and the grid. Cache files for images that no longer exist are removed when the Library is listed.
- **The strip orders by capture time (the time in the file name), not by when the file was last written,** so editing an old image never moves it. A PNG dropped in under another name is ordered by when it was created.
