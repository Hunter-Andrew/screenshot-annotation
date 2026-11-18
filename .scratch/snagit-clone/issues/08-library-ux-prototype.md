# Prototype: Library window

Type: prototype
Status: resolved
Blocked by: 04, 07

## Question

How should the Library look and feel? Its behavior is decided in [Capture flow](06-capture-flow.md): a Library Strip of thumbnails along the bottom of the editor, scrolling horizontally with about 5 visible, and an expand button to a full-window grid. Prototype the strip and the grid: thumbnail size, date grouping in the grid, the hover ✕, multi-select delete with an Undo notice, the delay-timer entry point, and copying directly from a thumbnail.

## Progress

Prototype: the chosen editor shell (layout A) with a working Library Strip and three "All captures" views.
- **Live:** https://claude.ai/artifact/Ucj82MTX15Ab6B8arj2wpH
- **Source:** branch `prototype/library-window`, `prototypes/library-window/index.html` (throwaway).
- **Variants:**
  - **A:** grid replaces the canvas area; side panels stay.
  - **B:** full-window grid.
  - **C:** grid plus a preview pane with Open, Copy and Delete.

All variants share date grouping, hover Copy/✕, Ctrl/Shift multi-select, the Delete key with an Undo notice, and Capture / in 3s / 5s / 10s buttons.

Verdict below.

## Answer

**Variant B: full-window grid.** Andrew chose it on 2026-11-14.
- **Opening it:** "⤢ All captures (N)" at the end of the Library Strip switches the whole window to the grid. The tool and Style panels and the strip are hidden while it's open. "Back to editor" or **Esc** returns.
- **Grid:** large thumbnails (~230 px wide), grouped under date headings (Today, Yesterday, weekday + date, then month), each showing its time and pixel size.
- **Header bar:** the capture count and selection count; "Delete N" and "Clear selection" when items are selected; "Back to editor (Esc)".
- **Opening an image:** click a thumbnail to open it in the editor.
- **Deleting** works the same in the grid and the strip: a hover ✕ (plus a hover Copy), Ctrl/Shift+click multi-select, the Delete key, and the Recycle Bin with an Undo notice.
- **Capture and delay timer:** the top bar holds Capture plus "in 3s / 5s / 10s", next to the tray menu entries.
- **Empty state:** "No captures yet. Press Print Screen to take one."

The in-canvas grid (A) and grid with preview pane (C) were rejected. The Library Strip stays as prototyped (~150 px thumbnails with hover Copy/✕).

## M4 addition (2026-11-18): collapsible strip

A small chevron on the Library Strip's top edge collapses it to a thin bar and expands it again. The state is the Rust-validated `libraryStripCollapsed` setting, so it survives restarts.
