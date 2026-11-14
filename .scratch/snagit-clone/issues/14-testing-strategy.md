# Grilling: Testing strategy

Type: grilling
Status: resolved
Blocked by: 

## Question

How do we test? Cover:
- unit tests for the Annotation model, PNG chunk read/write, and history expiry;
- Rust tests for capture and clipboard;
- end-to-end tests of the editor (Playwright against the web UI);
- what CI runs on every push versus before a release;
- which checks only Andrew can do manually on the work laptop (multi-monitor, Teams/Outlook paste).

## Answer

Decided with Andrew on 2026-11-14.

**1. Test-first unit tests**, written before each feature:
- **Annotation model:** a save/load round-trip gives back an identical model.
- **PNG embedding:** the visible pixels are the finished image, the Capture and model are embedded, and an older app opens a newer file read-only.
- **Export safety:** a copied or saved PNG **never** contains the embedded chunk or the original Capture.
- **Undo history:** the 200-step cap, 2-month expiry, and discarding history when the file changed outside the app.
- **Library:** file naming and collisions, month folders, and picking up files added or deleted in Explorer.

**2. A small end-to-end suite** (Playwright against the editor web UI) covering the main paths:
- draw each tool;
- edit text in place;
- undo/redo;
- switch images via the Library Strip;
- delete with Undo;
- Copy produces a plain image.

**3. CI** (GitHub Actions, Windows):
- **Every push:** unit + end-to-end tests, then build the installer.
- **A `vX.Y.Z` tag:** the same, then publish the Release.
- A red test blocks the release.

**4. A manual release checklist** in `docs/release-checklist.md`, about 10 minutes on the work laptop:
- install over the old version and confirm the Library and settings survive;
- hotkey → overlay on each of the 3 monitors;
- region, window and monitor capture;
- paste into Teams and Outlook;
- confirm blur is pixelated in the pasted image;
- close the editor and confirm the hotkey works from the tray;
- sign out and back in, and confirm the tray icon returns;
- **speed feels instant**: hotkey to overlay under about 150 ms, and release to editor under about 300 ms.

Agents remind Andrew to run it before every release (recorded in `CLAUDE.md`).

**5. No automated speed checks.** Speed is judged by hand on the checklist.
