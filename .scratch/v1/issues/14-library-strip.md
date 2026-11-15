# 14: Library Strip

**What to build:** A row of thumbnails runs along the bottom of the editor, newest on the left, scrolling sideways with about 5 visible, followed by an "All captures (N)" button (inactive until the grid ticket). Clicking a thumbnail auto-saves the current image and opens the clicked one. New captures appear at the left. Thumbnails come from a disposable cache in local app data.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] The strip lists the Library folder's month subfolders, newest first
- [x] Clicking switches images safely
- [x] The thumbnail cache is rebuildable and never written to Pictures
- [x] E2E with the fake bridge

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Verified on Linux: `npm run typecheck`, Vitest (including `src/editor/Editor.library.test.tsx` against the fake bridge), Playwright e2e (`e2e/library.spec.ts`), the pure-std Rust modules with `cargo test` in a scratch crate, and `cargo check --target x86_64-pc-windows-gnu` for the Tauri glue.
- Newest first means the capture time in the file name, not the file's write time, so editing an old image never moves it (a PNG dropped in under another name is ordered by its creation time). Startup reopens the newest image by that order (the old `openLatestLibraryImage` / `latest_png` by modification time are gone).
- The bridge gained `listLibrary`, `readLibraryFile`, `getThumbnail` and `onLibraryChanged`. Thumbnails are made in Rust (`thumbnail.rs`, the existing `png` crate, no new dependency), one 460 px size for strip and grid, cached under `%LOCALAPPDATA%\<app id>\thumbnails` by a fixed-hash name from path, modified time, size and edge (`library_index.rs`), and tidied when the Library is listed. The webview loads them lazily, three at a time (`src/library/thumbnails.ts`).
- "All captures (N)" is live (ticket 16). The editor now holds one open image instead of a session list; switching saves the current one first.
- Not verified (Windows only, new M3 items in `docs/release-checklist.md`): thumbnail sharpness at 125/150/200% scaling, speed with 100+ images, and that the cache survives an upgrade.
