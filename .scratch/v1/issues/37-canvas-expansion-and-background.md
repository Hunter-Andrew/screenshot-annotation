# 37: Canvas expansion ("crop in reverse") and per-image background

**What to build:** Andrew can make edits beyond the edge of the Capture, and the image grows to hold them. He can also drag the canvas edges outward like a rectangle (the reverse of Crop). The area outside the Capture is filled with a background chosen per image: transparent, white or dark (dark-mode). Which one new images start with is a setting. Requested 2026-11-15 during M2 testing; decided to build it together with Crop (ticket 21) in M4, not in M2.

**Blocked by:** 21 (Crop; done)

**Status:** ready-for-agent

## Why M4 with Crop, not now

Crop (ticket 21, M4) and this are one concept: the visible area of the Annotated Image, a rectangle that is smaller than the Capture (Crop) or larger (expansion). Building expansion first would add a second area concept that Crop then has to be merged with. Both change the app-owned model (ADR 0005, a format version bump), the renderer and Export, the undo history (a `setCrop`-like edit; ticket 13 left a hook), the Library thumbnails and the embedded data (ADR 0004). Doing them in one design avoids doing that twice.

## Requirements (Andrew)

- Drawing or moving an Annotation past the Capture's edge automatically enlarges the visible area to include it (resolution of the exported image increases).
- Dragging the canvas edges and corners outward enlarges it, like resizing a rectangle; dragging inward is Crop.
- Per-image background for the area outside the Capture: transparent, white, or dark (dark-mode). A default for new images is configurable in Settings.
- The original Capture is never altered (ADR 0002); the Library file's visible pixels and every Export show the finished image including the extended area and its background.

## Open questions (grill before implementing)

- Model: one `visibleArea` rect in Capture coordinates that may extend beyond the Capture (recommended), replacing a Crop-only field; how it migrates from the Crop field if Crop ships first.
- Transparent background: Export and clipboard as PNG with alpha (Teams/Outlook paste may flatten it); is a transparent default sensible, and should Export warn?
- Dark background color (a fixed value, or configurable like the hex colors) and whether "dark" follows the system theme.
- Auto-grow: does it only grow, or shrink back when an Annotation is moved back inside? (Recommended: only grows; shrinking is Crop.)
- Maximum canvas size (memory), and what happens past it.
- Undo: is a canvas resize one undo step, and does auto-grow from drawing merge with the drawing's step?
- Where the default-background setting lives (Settings window, next to other defaults) and per-image control (editor top bar or Style panel when nothing is selected).

Spec: `.scratch/snagit-clone/spec.md` (story 109).

## Decisions (grilling session with Andrew, 2026-11-17: all agreed)

**Model**
- Crop and expansion are one concept: `model.crop` (the visible area, a rect in Capture coordinates) may now extend past the Capture. Smaller than the Capture is Crop; larger is expansion. One field, one render path. Old files load unchanged.
- New per-image `background`: `"white" | "dark" | "transparent"`. Dark is the fixed colour `#1f2937` (not tied to the system theme). Additive: no `formatVersion` bump, no migration. A file with no `background` takes the Settings default the first time its area extends past the Capture, and stores it then. An older app opening an expanded file shows the Capture without the extension (accepted).
- Maximum visible area 8192 px per side (the same as the paste limit). Auto-grow and handle drags stop at the limit with a plain status-line message; nothing is resampled.

**Behaviour**
- Drawing or moving/resizing any Annotation (a pasted image too) past the edge grows the visible area to include it. It only grows; shrinking is always an explicit Crop. The growth is part of the same undo step as the edit that caused it (one Ctrl+Z undoes both).
- The Crop tool (`C`) shows eight handles on the visible area: inward crops, outward expands. Drawing a fresh rectangle still works and may reach outside the Capture. A handle drag is one undo step.
- A pasted image is still placed inside the Capture and scaled to fit (ticket 38), and never grows the area when pasted.
- Export, Copy, Save as PNG and the Library file's visible pixels show the finished area: the Capture, the background fill outside it, the Annotations, and alpha for Transparent. The Capture is never altered (ADR 0002). No transparency warning on Copy; the release checklist notes that pastes may flatten it.

**View**
- The editor shows a dark margin of about 25% of the visible area around it, so gestures can start, end or drag out there. Everything outside the visible area (the margin and any cropped-out part of the Capture, Annotations included) is drawn very dark so it clearly is not part of the image.
- In Fit mode the view re-fits whenever the visible area changes (Crop, handle drag, auto-grow), so the image keeps filling the same space instead of becoming a small rectangle. During a drag it does not re-fit; it re-fits on release. After a manual zoom it never moves on its own.

**Controls and settings**
- An "Image" section in the Style panel with Background: White, Dark, Transparent. Visible with the Select tool when nothing is selected, and while the Crop tool is active. A change is one undo step.
- Settings: **Image background** (default for new images: White / Dark / Transparent; default Transparent) and **Transparency checkerboard** (Dark / Light; default Dark; changes how transparency looks in the editor and the Library only, never exported).
- Library Strip and grid draw the same checkerboard behind transparent thumbnails.

## Acceptance criteria

- [ ] Unit: the visible area may extend past the Capture; Crop round-trips and widening restores the original area; the 8192 px limit clamps with a message
- [ ] Unit: Export of an expanded image is the area's size, with the background colour (or alpha) outside the Capture, no `snAP` or `snIM` chunk, and the Capture bytes in the Library file unchanged
- [ ] Unit: auto-grow only grows, and the growth and the edit are one undo step; a handle drag is one step; undo restores the previous area and background
- [ ] Unit: a file without `background` loads and exports as before; the default applies when it first extends
- [ ] Component: the Image section in the Style panel (Select with nothing selected, and Crop tool), Settings fields and their stored values
- [ ] E2E (real Fabric): draw/move an Annotation past the edge grows the area; Crop handles expand and crop; Fit mode re-fits (not mid-drag), manual zoom stays; Copy has the right size, background and alpha; a Blur still pixelates correctly over the extended area
- [ ] Manual checklist (M4): the dark margin and very dark outside, expand by handles and by drawing, transparent shown on the checkerboard (both themes), Copy into Teams

## Comments

- 2026-11-17 (M4 polish B, branch `m4/polish-b`): the design here is extended, with Andrew's agreement. Where the text above says otherwise, this wins.
  - **No border.** The static white outline round the visible area (`.crop-frame`, and the Crop tool's frame stroke) is gone; nothing is drawn round the area at rest. Only the dashed preview while drawing a new rectangle and the eight handles remain.
  - **View.** The "about 25% dark margin, as far as there is room" is replaced by the Canvas margin setting (default 48 px, 16 to 200): in Fit exactly that margin on all four sides, between the area and the Library Strip, tool column and Style panel (the fit leaves room for it); after a manual zoom the margin is a quarter of the area (never less than the setting) and all of it can be scrolled to and reached by gestures. The well's own padding is gone, and a big Capture cropped small no longer makes the well scroll.
  - **Outside darkness.** Everything outside the visible area is dimmed by the Outside-canvas darkness setting (default 60%, 0 to 95) instead of "very dark"; applies live.
  - **Show outside the canvas** (new per-image `showOutside`, Image section of the Style panel, undoable): off, the outside is the dark fill only (no cropped-out Capture, no off-canvas Annotations). A new image takes `showOutsideDefault`, stored with the image when it is created; a file without the field shows the outside.
  - **Auto-grow now shrinks back** (replaces "it only grows"): the model records the base area and which Annotations grew it (`areaBase`, `grownBy`); resizing, moving back inside or deleting a cause shrinks the area to what the remaining causes need, never below the base, in the same undo step. An explicit Crop (rectangle, handle, Remove crop) clears the record: nothing shrinks after that. Old files without the record are unchanged. See ADR 0002 and 0005 (2026-11-17, M4 polish B).
  - Done: unit (`src/core/areaShrink.test.ts`, `area.test.ts`, `view.test.ts`), component (`Editor.outside.test.tsx`), e2e with real Fabric (`e2e/outside.spec.ts`, `e2e/expansion.spec.ts`, `e2e/crop.spec.ts`); manual checklist items added (M4).

- 2026-11-17 (M4 fixes C, branch `m4/fixes-c`, after Andrew's installer testing): the reach rule above changed; where the text above (including the M4 polish B comment) says otherwise, this wins.
  - **Reach while dragging.** The Canvas margin is no longer a limit on a gesture. A press must still start on the canvas (its margin included), but from then on the drag follows the pointer wherever it goes, outside the canvas element and outside the editor window, until the 8192 px limit (`limitPoint` and `shiftIntoLimit` in `src/core/area.ts`; the status-line message is the same). It applies to drawing with any tool, to moving Annotations, to the Crop tool's rectangle and to the eight handles. The Canvas margin setting still decides the margin shown in Fit and the scrollable margin after a zoom. The canvas only draws its own margin, so the preview stops at its edge; the result follows the pointer on release, and in Fit the view re-fits then. Resizing an Annotation by its handles is not held at the limit while dragging: the area stops at 8192 px when it is applied, with the message.
  - **Handles on the visible area.** The Crop tool's frame was made at 0, 0 whenever the area did not start at the Capture's corner (a growth to the left or top, a crop that starts inside the Capture), so its handles sat in the wrong places until the next layout change. It is now placed by the area's own corner. A corner handle always resizes freely in both axes (Fabric's uniform scaling, and Shift, are bypassed for it); a pasted image's corners keep their rule.
  - **Outside-canvas darkness** defaults to 95 and goes from 0 to 99.9 in tenths (number box and slider in Settings, `f64` in `settings.rs`); a stored value, such as 60, stays as stored.
  - Done: unit (`src/core/area.test.ts`, `src/shared/imageSettings.test.ts`, `settings.rs`), component (`Settings.image.test.tsx`, `Editor.outside.test.tsx`), e2e with real Fabric (`e2e/reach.spec.ts`, `e2e/cropHandles.spec.ts`, `e2e/outside.spec.ts`); manual checklist items updated (M4).

## Update (M4 settings, 2026-11-18)

Dark is no longer the fixed `#1f2937`: it is the "Dark image background" setting (`#191919` by default), applied at render time and never stored in the file. See `.scratch/snagit-clone/issues/13-settings-screen.md`.

- 2026-11-18 (M4 p-text, branch `m4/p-text`, after Andrew's request): **Pen, Highlighter and Blur never grow the visible area**; where the text above says "any Annotation" grows it, this wins.
  - They can still be drawn, moved and resized past the edge (and, being exempt, are not held back at the 8192 px limit), but the area stays as it is. What lies outside is clipped from the render and the Export, drawn dimmed in the editor like any outside part, and stays in the Annotation: widen the area later (Crop tool handle) and it shows again. Arrow, Line, Rectangle, Ellipse, Text, Callout and Pasted image still grow it.
  - `growsArea(type)` in `src/core/area.ts`; `followAreaEdit` treats such an Annotation as having no bounds, so no growth is recorded in `grownBy` and the edit-history entry holds the edit alone. An older file whose `grownBy` names a Pen, Highlighter or Blur lets that area go the next time that Annotation is edited, moved or deleted. `fabricCanvas.ts` skips the drag limit (`reach`, `object:moving`) for them. The Eraser cuts Pen strokes only, so it never changes the area now.
  - A Blur straddling the edge pixelates what is visible: its last block at the edge averages the visible pixels only.
  - Done: unit (`area.test.ts`, `erase.test.ts`), e2e with real Fabric (`e2e/expansion.spec.ts`, `e2e/reach.spec.ts`); manual checklist item added (M4).
