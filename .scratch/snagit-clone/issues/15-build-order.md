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
| **M4 · Complete** | v0.5.0 | See below. |
| **M5 · Shortcuts, polish and facelift** | v0.6.0 | After M4. See below. |
| **M6 · Desktop demo tools** | v1.0.0 | After M5; v1.0.0 ships only when M6 is done. See below. |
| 
- Canvas expansion, "crop in reverse": edits past the Capture's edge grow the canvas, the canvas can be dragged larger, with a per-image transparent / white / dark background (added 2026-11-15; ticket 37, designed together with Crop).

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

**M4 · Complete (v0.5.0; tagged v0.5.0 instead of v1.0.0, decided 2026-11-18)**
- Callout, Highlighter, pixelate Blur and Crop.
- Paste images into the canvas (ticket 38): Ctrl+V adds an image Annotation that can be moved, resized, given a border and opacity (added 2026-11-16).
- The delay timer.
- Launch at sign-in and reset tool styles.
- Close-to-tray with its notice.
- Pre-warmed windows meeting the speed targets.
- Done when the full checklist passes.

**M5 · Shortcuts, demo tools and a UI facelift (v0.6.0), after M4 (v0.5.0)** (versions renumbered 2026-11-18: v1.0.0 ships after M6) (added 2026-11-15; demo tools added 2026-11-17)
- Settings lists every keyboard shortcut and lets each one be remapped (ticket 28): the capture-overlay keys (Space, M), the editor's tool and action keys, and Discard. Esc and the standard editing keys stay fixed and read-only.
- Low-risk by design, like Snagit and Greenshot: in-app keys are handled inside the app's own windows; the only global registration is the capture hotkey, using the standard Windows method plus the passive Print Screen listener of ADR 0007. No hooks, no key blocking.
- Demo tools, for presentations and screen shares (added 2026-11-17, Andrew; all `needs-triage`, to be grilled before building):
  - Editor Pointer tool (ticket 39) — merged into ticket 40 and moved to M6 (2026-11-18): a tool that turns the mouse into a coloured pointer over the canvas; the colour is a configurable style.
  - Desktop pointer highlight (ticket 40) — moved to M6 (2026-11-18): a pointer highlight over the whole desktop, run by the tray app and switched on and off by its own hotkey; the colour is set in Settings.
  - Screen annotation (ticket 41) — moved to M6 (2026-11-18): temporary rectangles and highlights drawn over the whole desktop, from a hotkey and/or a small pop-out toolbar that can be hidden and shown.
  - UI facelift (ticket 42): more colour, especially bright green and purple (matching the new logo), so the app pops more.
  - Style panel polish (added 2026-11-18, Andrew): the Text and Callout vertical alignment buttons all on the second row, with the horizontal ones alone on the first (ticket 43); better Highlighter thickness presets, dropping 2 and adding 8, 12 and 18 (ticket 44, `needs-triage`).
  - These add global hotkeys beyond the capture hotkey, so ticket 28's "capture hotkey is the only global registration" rule is widened for them: the standard `RegisterHotKey` method only, still no low-level hooks and no key blocking.

- **M5 build order (2026-11-18):** 43 → 44 → 28 (as 45 → 46 → 47 → 48) → 42 (facelift last).

**M6 · Desktop demo tools (v1.0.0), after M5** (split from M5 on 2026-11-18, Andrew)
- Desktop pointer highlight (ticket 40, absorbing ticket 39 as an editor button that toggles it) and screen annotation (ticket 41), designed together: click-through overlay windows plus their own `RegisterHotKey` global hotkeys.
- v1.0.0 is released only when M6 is finished.
- **Grilled 2026-11-19 (Andrew):** decisions are in tickets 40 and 41. Two global hotkeys (pointer Ctrl+Shift+L, drawing mode Ctrl+Shift+D), a "Demo tools" Settings section, the red laser dot with left-click ripple, drawing mode with Arrow, Rectangle, Pen and Highlighter using the editor's saved styles, a Teams-style toolbar pill with "Use apps", fixed drawing-mode keys that work only while the overlay has focus, and the pointer and drawings kept out of / in captures as decided there. Ticket 39 stays merged into 40.
- **M6 build tickets (2026-11-19):** 49 hotkeys and Settings section (with glossary and ADR); 50 pointer highlight; 51 editor toggle button and tool exclusion; 52 drawing overlays and tools; 53 toolbar pill and key rows; 54 fixed editor tool keys (Arrow, Rectangle, Pen, Highlighter); 55 M6 release checklist.
- **M6 build order:** 54 and 49 first (independent) → 50 and 52 (parallel, both need 49) → 51 (needs 50) and 53 (needs 52) → 55 last.

**Planning approach**
- Only M0 is broken into implementation tickets now (`.scratch/m0-skeleton/`). Later milestones are broken down when reached.
- Every capture uses the final storage format from M1, so nothing ever needs migrating.
