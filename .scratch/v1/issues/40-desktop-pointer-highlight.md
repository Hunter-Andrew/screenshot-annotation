# 40: Desktop pointer highlight (tray app, hotkey)

**What to build:** A pointer highlight that works over the whole desktop, not just inside the editor, run by the app in the tray. A hotkey (separate from the capture hotkey, like the Print Screen one: rebindable in Settings) switches it on and off. Its colour is configurable in Settings. Purpose: demos and screen shares.

## Constraints

- A transparent, click-through, non-focusable overlay window that follows the cursor (the same technique as the delay timer's countdown badge, `src-tauri/src/countdown.rs`); clicks must pass through to the apps below.
- The new global hotkey uses the standard `RegisterHotKey` method only (no low-level hooks, no key blocking), per ADRs 0001 and 0007 and ticket 28's constraint.

## Open questions (grill at M6)

- Exact pixel sizes for Small / Medium / Large and the glow opacity.
- Does it hide when the mouse is idle?
- Multi-monitor and mixed-DPI behaviour (one overlay per monitor, as the capture overlay has).
- Hotkey default and where it is set (Settings, next to the capture hotkey); state shown in the tray menu (checked item)?
- Does it persist across restarts (off by default)?

**Blocked by:** nothing (M4 shipped as v0.5.0); M5 (v0.6.0) first.

**Status:** needs-triage

Spec: `.scratch/snagit-clone/spec.md`. Planned for M6 (v1.0.0, moved from M5 on 2026-11-18); requested by Andrew on 2026-11-17.

## Decisions (grilling, 2026-11-18)

1. **Moved to M6 (v1.0.0)**, together with ticket 41. v1.0.0 is released only when M6 is finished.
2. **Absorbs ticket 39:** the editor's tool column gets a button that toggles this global pointer (not an editor-only pointer).
3. **Look: a red "laser dot"** (option C in `.scratch/v1/prototypes/m5-pointer-and-palette.html`): a bright red dot with a soft glow. Default colour red, configurable in Settings.
4. **Size:** Small / Medium / Large in Settings (default Medium).
5. **Click ripple:** a brief expanding ring (~400 ms) on click, **on/off in Settings**.
6. The remaining questions are listed under "Open questions (grill at M6)" above.
