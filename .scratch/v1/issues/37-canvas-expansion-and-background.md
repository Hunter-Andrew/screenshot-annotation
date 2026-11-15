# 37: Canvas expansion ("crop in reverse") and per-image background

**What to build:** Andrew can make edits beyond the edge of the Capture, and the image grows to hold them. He can also drag the canvas edges outward like a rectangle (the reverse of Crop). The area outside the Capture is filled with a background chosen per image: transparent, white or dark (dark-mode). Which one new images start with is a setting. Requested 2026-11-15 during M2 testing; decided to build it together with Crop (ticket 21) in M4, not in M2.

**Blocked by:** 21 (Crop)

**Status:** needs-triage

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
