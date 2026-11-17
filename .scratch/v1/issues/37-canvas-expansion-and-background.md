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
