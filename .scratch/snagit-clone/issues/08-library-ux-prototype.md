# Prototype: Library window

Type: prototype
Status: claimed
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

Awaiting Andrew's verdict.
