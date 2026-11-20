# 53: Drawing toolbar (Teams-style pill) and the read-only key rows

**What to build:** The toolbar of ticket 41 (decisions 6 and 7). A small icon-only pill, left to right: Arrow, Rectangle, Pen, Highlighter, divider, Use apps, Undo, Collapse, Exit (X). The active tool is highlighted and every button has a tooltip with its key. Drawing mode always starts with Arrow selected, whatever tool was used last; the last tool is not remembered (Andrew, 2026-11-19). It starts top-centre on the monitor under the mouse, can be dragged to any monitor, and collapses to a small pill that expands on click. It is a separate small always-on-top window, excluded from captures with `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`. "Use apps" makes the overlays click-through while the drawings stay; choosing a drawing tool or pressing it again takes the mouse back. Settings lists the drawing-mode keys read-only under a "Drawing mode" group.

**Blocked by:** 52.

**Status:** resolved

Spec: `.scratch/snagit-clone/spec.md`. Decisions: ticket 41. Planned for M6 (v1.0.0).

## Acceptance criteria

- [ ] The pill has the buttons and order above, tooltips with keys, an active-tool highlight and Arrow as the starting tool
- [ ] Drag, collapse and expand work; the pill is never in a capture
- [ ] Use apps lets clicks reach the app below with the drawings still showing, and toggles back
- [ ] Settings shows the drawing-mode keys as read-only rows; no horizontal scroll
- [ ] Unit tests (written first) for the toolbar state; E2E with the fake bridge for each button
- [ ] Release checklist (M6), Windows only: dragging across monitors, Use apps with a real app, the pill absent from a capture

## Answer

Implemented in M6 on integration branch `claude/pensive-davinci-z10bb6`; reviewed with `code-review` and fixes applied. Awaiting the Windows manual checklist (`docs/release-checklist.md`, "For v1.0.0 (M6)") before any v1.0.0 tag; not released.
