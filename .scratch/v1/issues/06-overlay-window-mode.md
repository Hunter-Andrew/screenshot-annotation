# 06: Overlay window mode

**What to build:** In the overlay, hovering highlights the window under the cursor, and clicking captures that window's visible rectangle (no shadow), clipped to the clicked monitor.

**Blocked by:** 05 (Capture overlay: region mode)

**Status:** resolved

- [x] Hover highlight follows the window under the cursor
- [ ] The click captures only the visible pixels, with no shadow
- [ ] A window that hangs off the edge of a monitor is clipped to the clicked monitor

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

Implemented on a branch off the integration tip (ticket 05 included). Verified on Linux: `rustc --test src-tauri/src/geometry.rs` (clip to a monitor, negative origins, extreme rectangles, z-order kept, non-windows dropped, overlay handles excluded), vitest (`windowAt` z-order hit-testing, click versus drag, Overlay component through the fake bridge: highlight follows the pointer to the topmost window, click reports `{kind:"window"}`, drag from over a window is still a region, bare desktop captures nothing), Playwright (overlay route with windows injected via `?overlayWindows=`), `tsc`, `cargo check --target x86_64-pc-windows-gnu` (compiles the Win32 enumeration, no warnings), and `src/shared/rustParity.test.ts`.

Ticked: "Hover highlight follows the window under the cursor", for the logic and the UI (hit-testing, highlight, z-order between listed windows). Which windows the OS lists and in what order is Windows-only (below).

Not ticked, Windows-only and unverifiable here (all on `docs/release-checklist.md`, Capture section, "Window mode"):
- "Only the visible pixels, no shadow": the rectangle comes from `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` (falling back to `GetWindowRect`); that it really excludes the shadow and resize border, and that a maximised window's overhang is cut, was not run. The crop itself reuses the tested `crop_rgba`.
- "Hangs off the edge is clipped to the clicked monitor": `clip_to_monitor` and `windows_on_monitor` are tested with negative coordinates and a window straddling two monitors; the real multi-monitor / mixed-DPI run is not.
- Not run on Windows: `EnumWindows` order being top-of-z-order first, the visible/minimised/cloaked/Progman/WorkerW filters, occlusion (topmost window containing the point is chosen by rectangle; a covered part of the captured rectangle shows the covering window, as the frozen frame does), and the overlay windows being excluded (belt and braces: the list is read before any overlay window exists, and overlay HWNDs from `window.hwnd()` are also filtered).

Design notes: the platform reads the window list once, right after freezing the screen, clips it per monitor and sends it to each overlay (`overlayWindows`); the overlay hit-tests locally (no IPC per mouse move) and reports an index, so the rectangle that is cropped always comes from the platform's own copy. A press and release within 4 CSS pixels is a click (window mode); anything more is a region drag. Transparent or click-through topmost windows (e.g. another app's overlay) count as windows; not handled.
