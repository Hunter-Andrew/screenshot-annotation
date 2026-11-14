# 24: Pre-warmed windows for speed

**What to build:** The overlay and editor windows are created at startup and kept hidden (ADR 0003), so the hotkey shows the overlay in under about 150 ms and the editor shows the capture in under about 300 ms after release.

**Blocked by:** 05 (Capture overlay: region mode), 09 (Side-panel editor and Arrow tool)

**Status:** ready-for-agent

- [ ] Windows are pre-created hidden
- [ ] No automated speed tests; judged on the manual checklist

Spec: `.scratch/snagit-clone/spec.md`.
