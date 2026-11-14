---
status: accepted
---

# One PNG per Annotated Image, with editable data embedded

Each Annotated Image is stored as a single PNG in `Pictures\Screenshot Annotation\YYYY-MM\`. The PNG's visible pixels are the finished image, so any app can view it. The original Capture, the Annotations, the Crop and a format version are embedded in a PNG chunk that only this app reads back to make the image editable again. We chose this over a folder per image (capture, JSON, thumbnail) because it gives one self-describing file per image: viewable in Explorer, moved and synced as a unit, with no orphaned parts.

## Consequences

- Files are about 2× the size of a plain screenshot.
- The Library file contains unblurred pixels (ADR 0002). Therefore every Export (Copy, Save as PNG…) is a **plain** PNG with no embedded data.
- The folder is the source of truth: files deleted or added in Explorer are reflected in the Library. Thumbnails are a disposable cache in `%LOCALAPPDATA%`.
- Saves are atomic (temp file, then replace), and files carry a format version; an older app opens a newer file read-only.
