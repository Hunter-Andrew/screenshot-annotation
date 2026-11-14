# 04: Tracer: hotkey → monitor capture → editor → Copy, saved to Library

**What to build:** Andrew presses Ctrl+Shift+S, and the monitor under the cursor is captured at native resolution without the cursor. The editor shows it, and Copy puts a plain PNG on the clipboard. The capture is saved immediately as a Library PNG in Pictures\Screenshot Annotation\YYYY-MM\, named by capture time, with the Capture and an empty Annotation model embedded. This introduces the Annotated Image core (create, encode, decode, Export).

**Blocked by:** 01 (Installable tray app with About)

**Status:** ready-for-agent

- [ ] Unit tests (written first): encode/decode round-trip; visible pixels equal the finished image; Export has no embedded chunk or Capture; plain PNG decodes as an Annotated Image with no Annotations
- [ ] Writes are atomic (temp file, then replace); names get a -2, -3 suffix on collision (Rust test)
- [ ] E2E with the fake bridge: a capture appears in the editor and Copy writes a plain PNG to the fake clipboard
- [ ] Manual: paste into Teams and Outlook works

Spec: `.scratch/snagit-clone/spec.md`.
