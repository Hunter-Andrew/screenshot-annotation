# Grilling: Annotated Image storage format

Type: grilling
Status: resolved
Blocked by: 

## Question

Decide the on-disk shape of an Annotated Image in `Pictures\Screenshot Annotation`:
- **File layout:** a folder per image, or a single file (e.g. PNG with embedded data, or a zip)?
- **Format versioning.**
- **Thumbnails.**
- **Naming:** how files and folders are named.
- **Safety:** atomic saves, and how all of this behaves under OneDrive sync.

Write the storage ADR.

## Answer

Decided with Andrew on 2026-11-14. See ADR 0004.

**Layout and naming**
- **One PNG per Annotated Image:** `Pictures\Screenshot Annotation\YYYY-MM\YYYY-MM-DD HHmmss.png` (`-2`, `-3`… suffix on collision). No renaming in v1.
- **The visible pixels are the finished (annotated, cropped, pixelated) image,** so Explorer, Photos and other apps show the result.
- **Editable data lives in a PNG chunk:** the original Capture, the Annotations, the Crop, and a format version.
- **About 2× the size** of a plain screenshot. Accepted.

**The folder is the source of truth**
- A file deleted in Explorer disappears from the Library.
- A plain PNG dropped into the folder appears as an Annotated Image with no Annotations.

**Saving**
- **Atomic:** write a temp file in the same folder, then replace the original.
- **Auto-save** runs about 1 s after the last change.

**Versioning**
- A newer app always upgrades older files.
- An older app opens a newer file read-only.

**Thumbnails** are a disposable cache in `%LOCALAPPDATA%`, rebuilt from the PNGs. They are never written to `Pictures`.

**Exports are always plain images.** Copy and "Save as PNG…" never carry the embedded data, so the unblurred Capture never leaves the Library.

**OneDrive / cloud-only files:** no special handling. The Library is not meant for cloud-only use. If OneDrive happens to sync the folder, opening a file lets OneDrive fetch it as normal.
