# 40: Desktop pointer highlight (tray app, hotkey)

**What to build:** A pointer highlight that works over the whole desktop, not just inside the editor, run by the app in the tray. A hotkey (separate from the capture hotkey, like the Print Screen one: rebindable in Settings) switches it on and off. Its colour is configurable in Settings. Purpose: demos and screen shares.

## Constraints

- A transparent, click-through, non-focusable overlay window that follows the cursor (the same technique as the delay timer's countdown badge, `src-tauri/src/countdown.rs`); clicks must pass through to the apps below.
- The new global hotkey uses the standard `RegisterHotKey` method only (no low-level hooks, no key blocking), per ADRs 0001 and 0007 and ticket 28's constraint.

## Open questions (grill before building)

- Shape, size and opacity; a click ripple; does it hide when the mouse is idle?
- Multi-monitor and mixed-DPI behaviour (one overlay per monitor, as the capture overlay has).
- Hotkey default and where it is set (Settings, next to the capture hotkey); state shown in the tray menu (checked item)?
- Does it persist across restarts (off by default)?

**Blocked by:** the v1.0.0 release (M0 to M4 complete).

**Status:** needs-triage

Spec: `.scratch/snagit-clone/spec.md`. Planned for M5 (v1.1.0); requested by Andrew on 2026-11-17.
