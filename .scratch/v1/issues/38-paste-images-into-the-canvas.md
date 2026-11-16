# 38: Paste images into the canvas

**What to build:** Andrew pastes an image from the clipboard (Snipping Tool, a browser's "copy image", another screenshot) with Ctrl+V and it becomes an `image` Annotation on the canvas that he can move, resize, restyle and delete like any other (Andrew, M3 testing, 2026-11-16). Designed with Andrew in a grilling session on 2026-11-16; every decision below was agreed.

**Blocked by:** 09 (Side-panel editor and Arrow tool). It does not wait for Crop (21) or canvas expansion (37) and must work alongside them.

**Status:** ready-for-agent

## Behavior

- **Entry point:** Ctrl+V only, read from the editor's paste event (no Rust change; the CSP already allows blob/data images). Dragging a file in or an "Insert image…" picker is out of scope.
- **Ctrl+V rules:** while a text box is being edited or a text field has focus, Ctrl+V stays a text paste and never adds an image. If the clipboard holds both text and an image and nothing is being typed, the image wins.
- **Placement:** centred in the part of the canvas that is visible, at 100% of its pixel size. If it is bigger than the Capture it is scaled down to fit inside the Capture, keeping its shape. It never grows the canvas (ticket 37 revisits this when it lands). Afterwards the image is selected, and a drawing tool that was active goes back to Select.
- **Handles:** eight handles and drag to move. Corner handles keep the aspect ratio (Shift frees them), side handles stretch freely. No flipping by dragging past the opposite edge.
- **Style panel:** Border and Opacity groups; there is no tool-column button.
  - **Border:** off by default; color (the 8 colors, custom picker and hex field), width 1-30 px with presets 2, 4 and 8. Drawn inside the image's edge, so it never changes the footprint or the handles. Always solid.
  - **Opacity:** one slider with a number box, 10-100%, default 100%. It applies to the image pixels only. The pasted PNG's own transparency is kept and multiplies with it.
  - **No sticky styles:** every pasted image starts with the border off and opacity 100%. Nothing is added to `toolStyles` in `settings.json`; "Reset tool styles" has nothing to reset.
- **Stacking, undo and delete:** bring forward, send back and Delete work as for any Annotation. A paste is one undo step (add); Ctrl+Z removes the image. Moving, resizing and restyling are one step per gesture. Undoing a delete brings the image back with its original pixels, because the undo history keeps the bytes.
- **Nowhere to paste:** with no image open, Ctrl+V changes nothing and the status line says "Take or open a capture before pasting an image". A read-only image (saved by a newer version) refuses the paste with the existing read-only wording. In the full-window grid Ctrl+V does nothing.
- **Limits:** up to 8192 px on each side and about 25 MB of PNG data per image, and at most 20 images per Annotated Image. Anything over is refused with a plain message in the status line. The app never silently resamples a paste.
- **Blur (ticket 20):** Blur pixelates everything beneath it in the stacking order, including pasted images, as the user sees it (opacity included). Ticket 20 carries this as an acceptance criterion.

## Model and file format (ADR 0004, 0005)

- A new Annotation type `image`: `{ id, type: "image", x, y, width, height, imageId }` in Capture pixels, plus the `border` and `opacity` property groups (new groups in `propertyGroups.ts`; the tool opts into them like any other).
- **Storage:** each pasted image's PNG is stored once as its own private PNG chunk (`snIM`) in the Library file, referenced from the Annotation by `imageId`. The model JSON stays small, and the same image pasted twice stores its bytes once (compare by content hash). A chunk no Annotation references any more is dropped on the next save. Undo history keeps the bytes of deleted images so Undo can restore them.
- **Format version:** `formatVersion` becomes 2 only for a file that contains at least one image Annotation; files without images stay version 1. An older app (M3) therefore opens an image file read-only instead of failing on an unknown type (the "newer version opens read-only" rule of ADR 0004). Writing version 2 only when needed is a deliberate exception to "adding a tool needs no bump", because this change adds an embedded part older readers cannot skip.
- **Export and Copy:** the pasted image is burned in with its border and opacity; the result is a plain PNG with no `snAP` and no `snIM` chunk (ADR 0002 and 0004). The Library file's visible pixels show it too.
- **Library thumbnails and the grid** use the file's visible pixels, so they need no change.

## Acceptance criteria

- [ ] Unit (test-first): the model and the `snIM` chunk round-trip through a Library PNG unchanged
- [ ] Unit: `formatVersion` is 2 exactly when the model has an image, and 1 otherwise; a version-2 file opens read-only in a reader that supports version 1
- [ ] Unit: an Export of an image with a pasted image contains neither `snAP` nor `snIM`
- [ ] Unit: the same image pasted twice stores its bytes once; an unreferenced chunk is dropped on save; undo history can restore a deleted image's bytes
- [ ] Unit: the limits (8192 px, about 25 MB, 20 images) are enforced with a message and nothing is resampled
- [ ] Unit: placement scales an oversized image down to fit the Capture, keeps its shape, centres it in the visible area, and never changes the canvas size
- [ ] Component (fake bridge): Ctrl+V adds a selected image, Ctrl+V in a text box or field stays text, the empty-editor and read-only messages, undo, redo, delete, stacking order
- [ ] E2E (real Fabric): paste, move, resize by corner (aspect kept; Shift frees it) and by side, set border and opacity, Copy burns the image in as a plain PNG, reload keeps it editable
- [ ] Blur (ticket 20) pixelates a pasted image beneath it
- [ ] Manual (checklist, M4): copy from Snipping Tool, paste, move and resize, then Copy into Teams and confirm the image is burned in

Spec: `.scratch/snagit-clone/spec.md` (story 110).
