# 55: M6 release checklist for v1.0.0

**What to build:** Add the M6 items to `docs/release-checklist.md` (each marked M6) and a "For v1.0.0 (M6)" Quick check: the Windows-only behaviours the Linux tests cannot see, from tickets 49 to 53 and their decisions. Update the README milestone table and status. Do not tag or publish: per `CLAUDE.md`, v1.0.0 ships only when Andrew has run the checklist on the Windows test PC and confirmed it passed.

Items to cover: both hotkeys register, rebind and refuse clashes, and survive a restart; pointer dot on a 24-inch monitor plus a laptop screen at different scales (same apparent size, follows across monitors, click-through, left-click ripple only, off after restart); dot, toolbar and ripple absent from a capture while drawings are present; drawing overlays on both monitors, Use apps with a real app, `Esc` and the hotkey clear; works over a PowerPoint slideshow and a screen-share window and is documented as unsupported over exclusive full screen; the tool keys never type into another app; the editor button and mutual exclusion; the instant capture with the editor minimized (no ghost frame) from v0.6.x.

**Blocked by:** 49, 50, 51, 52, 53, 54.

**Status:** ready-for-agent

Spec: `.scratch/snagit-clone/spec.md`. Planned for M6 (v1.0.0).

## Acceptance criteria

- [ ] Every item above is in the checklist with its milestone, and a Quick check section for v1.0.0 exists
- [ ] README reflects M6
