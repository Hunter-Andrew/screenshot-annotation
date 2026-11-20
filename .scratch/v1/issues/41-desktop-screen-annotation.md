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

**Status:** resolved

Spec: `.scratch/snagit-clone/spec.md`. Planned for M6 (v1.0.0, moved from M5 on 2026-11-18); requested by Andrew on 2026-11-17.

## Decisions (grilling, 2026-11-19; settles the open questions above)

Build through tickets 49 (hotkeys), 52 (drawing overlays), 53 (toolbar), 54 (fixed editor tool keys), 55 (checklist). Shared decisions with ticket 40 are in both files. The mode is called **Drawing mode**.

1. **Hotkey:** its own global hotkey, default **Ctrl+Shift+D**, rebindable in Settings > "Demo tools". `RegisterHotKey` only; same refusal rules as ticket 40 decision 1. Pressing it again leaves the mode (clearing everything). Tray: an item "Draw on screen" showing the hotkey. Off at every start.
2. **Tools:** Arrow (the default), Rectangle, Pen, Highlighter. **They draw with the editor's saved style for each tool** (colour and thickness from `settings.json`), so drawing mode has no colour or thickness controls; the user changes them in the editor. **The Highlighter is the exception for opacity (Andrew, 2026-11-19):** it takes the editor's colour and thickness but NOT the editor's saved opacity, because the editor's Highlighter multiplies with the picture and a transparent overlay cannot, so a translucent fill at the editor's 80% would hide what is below. Its opacity is its own setting `drawingHighlighterOpacity` (percent, 5 to 60, default 20; anything missing or invalid is 20, an out-of-range number is clamped), edited in Settings > Demo tools > "Highlighter opacity in Drawing mode (%)" and read when the mode starts.
3. **How drawings go away:** `Esc` leaves drawing mode and clears everything; `Ctrl+Z` undoes the last drawing and `Ctrl+Y` redoes. No clear-all key, no auto-fade. Nothing is ever saved.
4. **Keys:** A arrow, R rectangle, P pen, H highlighter, Ctrl+Z, Ctrl+Y, Esc. They are **fixed (not remappable)**, plain in-window keys that work **only while the drawing overlay itself has keyboard focus**, so they can never type into another app. They are not global hotkeys. They are listed read-only in Settings under "Drawing mode". In "Use apps" mode (below) use the toolbar buttons or the hotkey. As a consequence, the editor's own Arrow, Rectangle, Pen and Highlighter keys also become fixed (ticket 54).
5. **Overlays:** one transparent overlay per monitor, created when the mode starts and destroyed when it ends (not pre-warmed). Each monitor is independent: a drawing cannot span monitors. While drawing, the overlay takes the mouse; outside drawing mode nothing of this feature is on screen except the toolbar.
6. **Toolbar:** a small Teams-style pill, icons only, left to right: Arrow, Rectangle, Pen, Highlighter, divider, **Use apps**, Undo, Collapse, Exit (X). The active tool is highlighted; every button has a tooltip with its key. **Every start of the mode is on Arrow, whatever tool was used last; the last tool is not remembered (Andrew, 2026-11-19).** It starts top-centre on the monitor under the mouse when the mode begins, can be dragged to any monitor, collapses to a small pill and expands again on click. It is a separate small window, hidden from captures with `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`.
7. **Use apps:** a toolbar button that makes the overlay click-through while the drawings stay visible, so the audience can watch the app being used. Choosing a drawing tool, or the button again, takes the mouse back.
8. **Captures:** a capture started during drawing mode **includes the drawings** (the overlay is not excluded); the toolbar is excluded. After the capture, drawing mode ends and the drawings clear.
9. **Pointer highlight (ticket 40)** may stay on while drawing mode is on.
10. **Full-screen apps:** works over borderless and maximized windows; exclusive full-screen games are unsupported in v1.0.

## Answer

Implemented in M6 on integration branch `claude/pensive-davinci-z10bb6`; reviewed with `code-review` and fixes applied. Awaiting the Windows manual checklist (`docs/release-checklist.md`, "For v1.0.0 (M6)") before any v1.0.0 tag; not released.
