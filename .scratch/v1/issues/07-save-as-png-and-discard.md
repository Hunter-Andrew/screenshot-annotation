# 07: Save as PNG… and Discard

**What to build:** Save as PNG… opens a Windows save dialog and writes a plain Export. Discard (or Ctrl+Delete) removes the current Annotated Image from the Library.

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** ready-for-agent

- [ ] The saved file is a plain PNG with no embedded data (unit/e2e assertion)
- [ ] Discard removes the file; the editor shows the next image or the empty state

Spec: `.scratch/snagit-clone/spec.md`.
