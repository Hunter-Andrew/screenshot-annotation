# 52: Drawing mode: per-monitor overlays and the four tools

**What to build:** The drawing mode of ticket 41 (decisions 1 to 5, 8, 10), switched on and off by its hotkey (ticket 49) and a tray item "Draw on screen". When it starts, one transparent overlay per monitor is created (not pre-warmed) and destroyed when the mode ends. Arrow (the default), Rectangle, Pen and Highlighter draw with the editor's saved style for each tool, read from `settings.json` (no colour or thickness controls); the Highlighter is a translucent fill. `Ctrl+Z` undoes, `Ctrl+Y` redoes, `Esc` leaves the mode and clears everything. The keys A, R, P, H, Ctrl+Z, Ctrl+Y and Esc work only while a drawing overlay has keyboard focus (plain in-window keys, never global). A capture started during the mode includes the drawings; the mode then ends and clears. Nothing is saved. The toolbar is ticket 53; until then the tool is chosen by key.

**Blocked by:** 49.

**Status:** resolved

Spec: `.scratch/snagit-clone/spec.md`. Decisions: ticket 41. Planned for M6 (v1.0.0).

## Acceptance criteria

- [ ] Hotkey and tray item start and end the mode; Esc and the hotkey end it and clear everything
- [ ] Each tool draws with the editor's current style for that tool; the Highlighter is translucent
- [ ] Undo and redo work; a drawing never spans two monitors
- [ ] Tool keys do nothing when another app has focus (they are not registered globally)
- [ ] A capture during the mode contains the drawings, then the mode ends
- [ ] Unit tests (written first): the drawing-state model (tools, undo/redo, clear), reading editor styles with fallbacks, the key map
- [ ] E2E with the fake bridge: draw each tool, undo, redo, Esc clears
- [ ] Release checklist (M6), Windows only: overlays on both monitors of different DPI, a drawing lands where the pointer is, no click reaches the app below while drawing, a capture includes the drawings

## Answer

Implemented in M6 on integration branch `claude/pensive-davinci-z10bb6`; reviewed with `code-review` and fixes applied. Awaiting the Windows manual checklist (`docs/release-checklist.md`, "For v1.0.0 (M6)") before any v1.0.0 tag; not released.
