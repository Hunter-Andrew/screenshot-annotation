---
status: accepted
---

# Blur and crop are non-destructive; only the Export is altered

So that any Annotated Image can be reopened and fully edited, the original Capture is never modified. Crop is stored as a visible-area setting, and Blur is a movable Annotation that pixelates only when the image is Exported (copied or saved). The surprising consequence is that the Library folder (`Pictures\Screenshot Annotation`, possibly synced by OneDrive) still holds the unblurred original pixels. We accepted that because the folder belongs to the user, while everything that leaves the app (the Export) is safely pixelated. Blur is pixelate-only by design: a soft blur can sometimes be partly reversed.

## Considered Options

- **Burn blur into the Capture:** safe at rest, but the blur could no longer be moved or removed. Rejected.
- **A "permanently apply blur" action:** out of scope for v1.
