# 07: Save as PNG… and Discard

**What to build:** Save as PNG… opens a Windows save dialog and writes a plain Export. Discard (or Ctrl+Delete) removes the current Annotated Image from the Library.

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** resolved

- [x] The saved file is a plain PNG with no embedded data (unit/e2e assertion)
- [x] Discard removes the file; the editor shows the next image or the empty state

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Verified on Linux: vitest (Editor.test.tsx, fake bridge), Playwright e2e, tsc, rustc tests for library.rs helpers, and `cargo check --target x86_64-pc-windows-gnu` (type-checks the Windows-only SHFileOperationW code and the dialog command).
- Not verified (Windows only, covered by new M1 items in docs/release-checklist.md): the native save dialog, and that Discard really lands in the Recycle Bin and is restorable. Per spec story 95 and the Storage notes, Discard goes to the Recycle Bin (SHFileOperationW with FOF_ALLOWUNDO), not a permanent delete.
- "Next image" means the previous image captured this session. Browsing the whole Library arrives with M3.
- Discard is refused while the Library save is still in flight, so no orphan file is written.
