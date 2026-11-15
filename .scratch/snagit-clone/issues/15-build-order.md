# Grilling: Build order and milestones

Type: grilling
Status: resolved
Blocked by: 08, 13, 14

## Question

In what order do we build it, so that each milestone is a usable installer on the work laptop? For example: tray + capture + copy, then the editor tools, then the Library Strip, then the grid and polish. Define each milestone's scope and done criteria. This is the last ticket before coding.

## Answer

Decided with Andrew on 2026-11-14. Each milestone is a release Andrew installs on the work laptop and verifies with `docs/release-checklist.md`.

| Milestone | Version | Scope / done when |
| --- | --- | --- |
| **M0 · Skeleton** | v0.1.0 | See below. |
| **M1 · Capture → Copy** | v0.2.0 | See below. |
| **M2 · Annotate** | v0.3.0 | See below. |
| **M3 · Library** | v0.4.0 | See below. |
| **M4 · Complete v1** | v1.0.0 | See below. |

**M0 · Skeleton (v0.1.0)**
- Tauri 2 + React + TypeScript + Fabric.js scaffold.
- Tray icon with a menu.
- A Settings window with About (version, Check for updates).
- CI runs tests and builds the per-user NSIS installer on each push, and publishes a Release on a tag.
- `probes/` and `probes.yml` are deleted.
- **Done when** v0.1.0 installs on the work laptop with no admin and the tray icon works.

**M1 · Capture → Copy (v0.2.0)**
- Capture hotkey (Ctrl+Shift+S default, plus the Print Screen notice and the Settings hotkey recorder).
- One overlay with region, window and monitor modes, one monitor per capture.
- The editor opens with the Capture.
- Copy and Save as PNG…, with a plain Export.
- Every capture is saved immediately in the final Library format (ADR 0004).

**M2 · Annotate (v0.3.0)**
- The side-panel editor layout.
- Arrow, Line, Pen, Rectangle, Ellipse and Text, with the shared property groups.
- Select, move, resize and restyle.
- Sticky tool styles.
- Persistent undo/redo.
- Auto-save.

**M3 · Library (v0.4.0)**
- The Library Strip, and the full-window grid.
- Reopen and edit.
- Hover Copy/✕, multi-select delete, the Recycle Bin with Undo.
- Discard.
- The folder is the source of truth.
- The thumbnail cache.
- Settings shows all keyboard shortcuts and lets each one be remapped, including the capture-overlay keys (Space, Esc, M) and the editor keys (added 2026-11-15; ticket 28).

**M4 · Complete v1 (v1.0.0)**
- Callout, Highlighter, pixelate Blur and Crop.
- The delay timer.
- Launch at sign-in and reset tool styles.
- Close-to-tray with its notice.
- Pre-warmed windows meeting the speed targets.
- Done when the full checklist passes.

**Planning approach**
- Only M0 is broken into implementation tickets now (`.scratch/m0-skeleton/`). Later milestones are broken down when reached.
- Every capture uses the final storage format from M1, so nothing ever needs migrating.
