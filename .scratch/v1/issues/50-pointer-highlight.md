# 50: Pointer highlight over the desktop

**What to build:** The red laser dot (ticket 40 decisions 1 to 11) switched on and off by its hotkey (ticket 49) and by a checked tray item "Pointer highlight". One small transparent, click-through, non-focusable, always-on-top window follows the cursor across monitors (polled about every 16 ms, built like `src-tauri/src/countdown.rs`); position is set before size when it changes monitor, and the size is scaled by that monitor's scale factor. Settings > Demo tools gains colour (8 colours, custom picker, hex), size (Small/Medium/Large, default Medium) and the left-click ripple checkbox. The window is excluded from captures with `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`. Off at every start; the state is not saved.

**Blocked by:** 49.

**Status:** ready-for-agent

Spec: `.scratch/snagit-clone/spec.md`. Decisions: ticket 40. Planned for M6 (v1.0.0).

## Acceptance criteria

- [ ] Hotkey and tray item toggle the dot; the tray item shows checked while on and follows the hotkey
- [ ] Colour, size and ripple settings persist and apply at once to a visible dot
- [ ] Left click shows the ripple; right click does not; the ripple can be switched off
- [ ] Unit tests (written first): size and glow table, scale-factor sizing, position-before-size ordering and the position clamp (pure functions), settings round-trip
- [ ] E2E with the fake bridge: the Settings controls and the tray-state event
- [ ] Release checklist (M6), Windows only: dot follows the pointer on a 24-inch monitor plus a laptop screen and looks the same size on both; click-through works; not in a capture; works over a PowerPoint slideshow; off after a restart
