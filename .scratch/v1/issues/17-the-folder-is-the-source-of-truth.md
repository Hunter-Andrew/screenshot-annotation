# 17: The folder is the source of truth

**What to build:** Files deleted in Explorer disappear from the Library, and plain PNGs dropped into the folder appear as Annotated Images with no Annotations. A file written by a newer format version opens read-only with a notice.

**Blocked by:** 14 (Library Strip)

**Status:** resolved

- [x] Folder watch via the bridge
- [x] Unit: a newer format version decodes as read-only
- [x] E2E with the fake bridge raising add/remove events

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Verified on Linux: `npm run typecheck`, Vitest (including `src/editor/Editor.library.test.tsx` against the fake bridge), Playwright e2e (`e2e/library.spec.ts`), the pure-std Rust modules with `cargo test` in a scratch crate, and `cargo check --target x86_64-pc-windows-gnu` for the Tauri glue.
- The watch is polling, not a file-system watcher (ADR 0008): the real bridge polls a metadata-only signature (`library_signature`) every 2 s while the window is visible and checks at once when it is shown or focused (`src/platform/libraryWatch.ts`, unit tested with fake timers). `notify` can replace it behind `onLibraryChanged`.
- A plain PNG dropped in appears with no Annotations and is not rewritten until the first edit. A file saved by a newer format opens read-only with a notice (the format-version unit test already existed from M1; an editor test covers the notice, no writes, and Copy still working). If the open image is deleted in Explorer the editor lets it go without writing it back (`persister.abandon`) and shows the next image.
- Not verified (Windows only): behavior with a OneDrive-synced Pictures folder (out of scope: no special handling for cloud-only files).
