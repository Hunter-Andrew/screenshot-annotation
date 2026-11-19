---
status: accepted
---

# One PNG per Annotated Image, with editable data embedded

Each Annotated Image is stored as a single PNG in `Pictures\Sigil (Screenshot Annotation)\YYYY-MM\`. The PNG's visible pixels are the finished image, so any app can view it. The original Capture, the Annotations, the Crop and a format version are embedded in a PNG chunk that only this app reads back to make the image editable again. We chose this over a folder per image (capture, JSON, thumbnail) because it gives one self-describing file per image: viewable in Explorer, moved and synced as a unit, with no orphaned parts.

## Consequences

- Files are about 2× the size of a plain screenshot.
- The Library file contains unblurred pixels (ADR 0002). Therefore every Export (Copy, Save as PNG…) is a **plain** PNG with no embedded data.
- The folder is the source of truth: files deleted or added in Explorer are reflected in the Library. Thumbnails are a disposable cache in `%LOCALAPPDATA%`.
- Saves are atomic (temp file, then replace), and files carry a format version; an older app opens a newer file read-only.
- Pasted images (ticket 38) ride in the same file as one extra private chunk (`snIM`) per distinct picture, referenced from the model by `imageId` (the SHA-256 of the picture's PNG). A file is written as format version 2 only when it holds an image Annotation, and as version 1 otherwise, so an older app opens such a file read-only instead of failing on a type it cannot draw or silently dropping the embedded pictures on its next save. This is a deliberate exception to "adding a tool needs no bump": it adds an embedded part older readers cannot skip. Every Export strips `snIM` as well as `snAP`.
- The visible pixels of the file are the finished area, which since ticket 37 may be larger than the Capture (the Background fills outside it, with alpha for Transparent). The embedded Capture is still the original, and the Background is stored in the model (additive: no version bump).
