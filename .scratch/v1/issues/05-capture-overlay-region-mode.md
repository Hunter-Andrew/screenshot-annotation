# 05: Capture overlay: region mode

**What to build:** The hotkey freezes all monitors and shows an overlay on each one. Andrew drags a region, which stops at the edge of the starting monitor, and releasing captures it immediately. Space captures the whole monitor under the cursor; Esc cancels. The overlay shows crosshair guides, dims outside the selection, shows the pixel size, and has a magnifier toggled with M.

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** ready-for-agent

- [ ] Works across 3 monitors with negative virtual-screen coordinates (manual checklist)
- [ ] The region clamps to the starting monitor
- [ ] Space and Esc behave as described
- [ ] Magnifier toggles with M; pixel size shown
- [ ] The result opens in the editor and is saved to the Library

Spec: `.scratch/snagit-clone/spec.md`.
