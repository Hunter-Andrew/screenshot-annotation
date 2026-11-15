# 15: Deleting from the strip

**What to build:** Hovering a thumbnail shows Copy and ✕. Andrew can Ctrl/Shift+click several thumbnails and press Delete. Deleted images go to the Windows Recycle Bin with no confirmation dialog, and an Undo notice restores them. Discard uses the same path. Deleting an image also deletes its undo history.

**Blocked by:** 14 (Library Strip), 07 (Save as PNG… and Discard)

**Status:** resolved

- [x] Recycle Bin via the bridge (Rust wrapper test)
- [x] Undo restores the files
- [x] Multi-select with Ctrl and Shift
- [x] E2E: delete and undo

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Verified on Linux: `npm run typecheck`, Vitest (including `src/editor/Editor.library.test.tsx` against the fake bridge), Playwright e2e (`e2e/library.spec.ts`), the pure-std Rust modules with `cargo test` in a scratch crate, and `cargo check --target x86_64-pc-windows-gnu` for the Tauri glue.
- Decision (ADR 0008): Undo writes the files back from copies the app keeps in memory until the notice (8 s) ends or a newer delete replaces it, rather than asking the shell to restore from the Recycle Bin, which cannot be tested off the laptop. The Recycle Bin therefore also keeps its own copy after an Undo. `TrashStash` and `restore_file` in `library_index.rs` have Rust tests (restore, never overwrite a file that took the name, forget, retry after a failed restore).
- Deviation from the ticket text, agreed with Andrew: an image's undo history is deleted when the notice ends, not at the moment of the delete, so Undo brings the image back with its history.
- Delete means images only when thumbnails are picked; with an Annotation selected on the canvas (which clears the picked thumbnails) it still deletes the Annotation. Ctrl+Delete and the Discard button use the same path and also offer Undo. Deleting the open image shows the next older one, else the next newer, else the empty state.
- Not verified (Windows only): that deletes really land in the Recycle Bin (`SHFileOperationW`, unchanged since M1) and the Undo flow on real files. Covered by the M3 checklist items.
