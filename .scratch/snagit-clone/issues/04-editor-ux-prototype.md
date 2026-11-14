# Prototype: Editor layout and tool behavior

Type: prototype
Status: resolved
Blocked by: 12

## Question

What should the editor look and feel like? Cover the toolbar, the tool property panel (color, thickness, font), selecting and moving existing Annotations, Copy and Save actions, and keyboard shortcuts. Build a rough clickable HTML mock to react to.

## Progress

Prototype: three editor layouts on a working Fabric.js canvas with a Library Strip.
- **Live:** https://claude.ai/artifact/VncQCJMPQzaj2kxHznotnN
- **Source:** branch `prototype/editor-layout`, `prototypes/editor-layout/index.html` (throwaway).
- **Variants:**
  - **A:** Snagit-style side panels.
  - **B:** Office-style ribbon with a contextual style bar.
  - **C:** floating tool palette, with style shown as a popover next to the selection.

Verdict below.

## Answer

**Layout A: Snagit-style side panels.** Andrew chose it on 2026-11-14.
- **Top bar:** app name on the left; on the right, Discard, then Save as PNG…, then **Copy** (primary).
- **Left:** a vertical tool column showing each tool's name and shortcut key.
- **Center:** the canvas in a neutral well.
- **Right:** a Style panel for the selection or active tool, stacked vertically.
- **Bottom:** the Library Strip across the full width, with an "All captures" button that expands to the grid.

**Shortcuts**, validated in the prototype:

| Key | Action |
| --- | --- |
| V | Select |
| A | Arrow |
| L | Line |
| P | Pen |
| R | Rectangle |
| E | Ellipse |
| T | Text |
| O | Callout |
| H | Highlighter |
| B | Blur |
| C | Crop |
| Ctrl+C (nothing selected) | Copy |
| Delete | Delete the selected Annotation, or the selected thumbnails |
| Ctrl+Delete | Discard |
| Esc | Deselect and return to Select |

Ribbon (B) and floating (C) layouts were rejected.
