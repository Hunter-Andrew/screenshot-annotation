# 41: Draw temporary rectangles and highlights over the desktop

**What to build:** A demo tool for the whole desktop: draw rectangles and highlight areas of the screen on a temporary basis (they disappear when cleared or the mode ends; nothing is saved). Reached by a hotkey and/or a small pop-out toolbar that can be hidden and shown easily.

## Constraints

- While drawing, a full-screen transparent overlay takes the mouse; outside drawing mode it must be click-through. Global hotkey via `RegisterHotKey` only (no low-level hooks), like ticket 40.
- Ticket 40 (pointer highlight) and this tool share the overlay approach; design them together.

## Open questions (grill before building)

- Which tools: rectangle and highlight only, or also arrow, pen, text? Colours and thickness (reuse the editor's palette and Highlighter look)?
- How things go away: clear all with a key, auto-fade after a few seconds, or both?
- Toolbar: where it sits (draggable, edge-docked), how it hides and shows, and whether the hotkey alone is enough.
- Multi-monitor and mixed-DPI behaviour; does it work over full-screen apps?
- Can the result be captured (it is on screen, so a normal Capture includes it) or must it be excluded?

**Blocked by:** nothing (M4 shipped as v0.5.0); M5 (v0.6.0) first.

**Status:** needs-triage

Spec: `.scratch/snagit-clone/spec.md`. Planned for M6 (v1.0.0, moved from M5 on 2026-11-18); requested by Andrew on 2026-11-17.
