# 35: Text: drag to define the area

**What to build:** With the Text tool, Andrew can click and drag like a rectangle to define the rough area for the text (Andrew, M2 testing). A live dashed rectangle follows the pointer; on release the text box is created with that rectangle as its starting area and he types straight into it. The box keeps growing as he types. A plain click still makes a box with the default width.

**Blocked by:** 11 (Text tool)

**Status:** resolved

- [x] Dragging with the Text tool shows a live dashed rectangle; releasing starts in-place typing
- [x] The rectangle's top-left is the box's `x`/`y`; its width is the wrap width (long lines wrap there, never run past the right edge)
- [x] The dragged height is the box's minimum height: it grows downward as text wraps past it and never shrinks below it
- [x] A click (under 4 px of movement) keeps working: default width 240, no minimum height
- [x] A drag under 20 px wide is too thin: default width, no minimum height
- [x] Any direction (up, left) works; the area is clamped to the Capture
- [x] Esc during the drag cancels it (nothing created, tool back to Select)
- [x] Unit tests for the area logic; E2E: wrapping at the dragged width, growth past the height, reload and still editable at the same width, Export pixels inside the area, click, tiny drag, Esc
- [ ] On a real Windows machine: drag feel and the dashed preview on the work laptop (manual checklist)

## Comments

2026-11-15 (Claude, implementation):

**How it works.** `textAreaFromDrag(from, to, capture)` in `src/core/annotations/text.ts` is the pure rule; `textKind.fromDrag` uses it. `fabricCanvas.ts`: for a `typedInPlace` kind, `mouse:move` now draws a dashed Rect ghost (`previewArea`) instead of nothing; `mouse:up` is unchanged (it already called `fromDrag(..., size)` and `startTyping`). `setTool` now also drops the ghost, so Esc (which selects the Select tool) cancels a drag; the later mouse-up finds no gesture.

**Height decision.** The dragged height is the box's **minimum height**, stored as a new optional model field `TextAnnotation.minHeight` (Capture pixels). It is additive: images saved before this have no field and mean "no minimum" (unit test), and a click or a sliver stores none. Reason for storing it: without it the area would collapse to the text height the moment typing ended, and a reopened image could not be clicked inside the area it was drawn as. `TextShape.calcTextHeight` returns `max(lines, minHeight)`, so the box (its selection border and hit area) is at least that tall, grows downward as lines are added, and text still starts at the top. `width` stays the wrap width, as in ticket 11; the existing left/right handles still change it (the minimum height is not changed by them, and there is no handle for it).

**Thresholds.** Click: pointer moved under 4 Capture pixels in both axes. Tiny drag: under 20 px wide (the previous 24 px rule is replaced), which uses the default width 240 and drops the height too. Areas are clamped to the Capture; a default-width box near the right edge slides left (as before).

**Interaction with "return to Select".** Text defaults to returning to Select. The canvas used to reset its own tool to Select when the typing ended, which would have left it out of step with the editor when Text is set to keep drawing; that line is removed, so the editor's per-tool option (`returnsToSelect` in `onCreate`) alone decides. With the option off, Text stays active after a box is typed (clicking away ends the typing; Esc still ends it and returns to Select, as everywhere) and the next drag makes another box (e2e). A typing that ends with no words creates nothing and leaves the tool as it was.

**Verified on Linux:** vitest 405 (new: area direction, clamping, click, sliver, `fromDrag` fields, old image without the field), `tsc`, `vite build`, Playwright 68 (6 new in `e2e/text.spec.ts`): live dashed preview then typing; text wraps at the dragged width (no red Export pixel right of the area) and grows far past the dragged height; a 120 px minimum with a one-line text still selectable low in the area, after a reload still editable with the same `x`, `y`, width and minimum height; up/left drags and clamping at the right edge; click with a 2 px wobble and an 8 px sliver both get width 240 and no minimum height; Esc during the drag removes the preview and creates nothing. The existing Text e2e tests (undo/redo, empty edit, typing keys, Export equality) all still pass.

**Not verified (Windows only; see the M2 Text items in `docs/release-checklist.md`):** the feel of the drag and the dashed preview with a real mouse and display scaling; real Segoe UI line breaks inside the dragged width.

2026-11-16 (Claude, M3 testing notes): fixed the live dashed preview, which grew out from the press point in both directions while the button was down (Fabric 7 positions a new shape by its centre unless an origin is given); it now runs from the press point to the pointer in any direction, like the box that is created on release. Playwright covers both directions.
