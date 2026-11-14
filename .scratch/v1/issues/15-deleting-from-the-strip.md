# 15: Deleting from the strip

**What to build:** Hovering a thumbnail shows Copy and ✕. Andrew can Ctrl/Shift+click several thumbnails and press Delete. Deleted images go to the Windows Recycle Bin with no confirmation dialog, and an Undo notice restores them. Discard uses the same path. Deleting an image also deletes its undo history.

**Blocked by:** 14 (Library Strip), 07 (Save as PNG… and Discard)

**Status:** ready-for-agent

- [ ] Recycle Bin via the bridge (Rust wrapper test)
- [ ] Undo restores the files
- [ ] Multi-select with Ctrl and Shift
- [ ] E2E: delete and undo

Spec: `.scratch/snagit-clone/spec.md`.
