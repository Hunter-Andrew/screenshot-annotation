# 14: Library Strip

**What to build:** A row of thumbnails runs along the bottom of the editor, newest on the left, scrolling sideways with about 5 visible, followed by an "All captures (N)" button (inactive until the grid ticket). Clicking a thumbnail auto-saves the current image and opens the clicked one. New captures appear at the left. Thumbnails come from a disposable cache in local app data.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** ready-for-agent

- [ ] The strip lists the Library folder's month subfolders, newest first
- [ ] Clicking switches images safely
- [ ] The thumbnail cache is rebuildable and never written to Pictures
- [ ] E2E with the fake bridge

Spec: `.scratch/snagit-clone/spec.md`.
