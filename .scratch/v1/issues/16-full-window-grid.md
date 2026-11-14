# 16: Full-window grid

**What to build:** "All captures" switches the whole window to a grid of about 230 px thumbnails grouped under date headings (Today, Yesterday, weekday + date, then month), each showing its time and pixel size. A header shows the count and selection, Delete N and Clear selection, and Back to editor (Esc). Hover Copy/✕, multi-select delete and Undo work as in the strip. Clicking a thumbnail opens it in the editor. A new install shows an empty state telling Andrew to press the hotkey.

**Blocked by:** 15 (Deleting from the strip)

**Status:** ready-for-agent

- [ ] Date grouping is correct around midnight and month boundaries (unit)
- [ ] E2E: open the grid, multi-delete, undo, and Esc back
- [ ] Empty state shown

Spec: `.scratch/snagit-clone/spec.md`.
