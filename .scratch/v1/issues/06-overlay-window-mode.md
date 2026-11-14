# 06: Overlay window mode

**What to build:** In the overlay, hovering highlights the window under the cursor, and clicking captures that window's visible rectangle (no shadow), clipped to the clicked monitor.

**Blocked by:** 05 (Capture overlay: region mode)

**Status:** ready-for-agent

- [ ] Hover highlight follows the window under the cursor
- [ ] The click captures only the visible pixels, with no shadow
- [ ] A window that hangs off the edge of a monitor is clipped to the clicked monitor

Spec: `.scratch/snagit-clone/spec.md`.
