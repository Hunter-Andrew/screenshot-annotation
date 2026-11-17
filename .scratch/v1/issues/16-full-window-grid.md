# 16: Full-window grid

**What to build:** "All captures" switches the whole window to a grid of about 230 px thumbnails grouped under date headings (Today, Yesterday, weekday + date, then month), each showing its time and pixel size. A header shows the count and selection, Delete N and Clear selection, and Back to editor (Esc). Hover Copy/✕, multi-select delete and Undo work as in the strip. Clicking a thumbnail opens it in the editor. A new install shows an empty state telling Andrew to press the hotkey.

**Blocked by:** 15 (Deleting from the strip)

**Status:** resolved

- [x] Date grouping is correct around midnight and month boundaries (unit)
- [x] E2E: open the grid, multi-delete, undo, and Esc back
- [x] Empty state shown

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Verified on Linux: `npm run typecheck`, Vitest (including `src/editor/Editor.library.test.tsx` against the fake bridge), Playwright e2e (`e2e/library.spec.ts`), the pure-std Rust modules with `cargo test` in a scratch crate, and `cargo check --target x86_64-pc-windows-gnu` for the Tauri glue.
- Headings: Today, Yesterday, "Wednesday 11 November" for the rest of the past week (up to 6 days ago), then "October 2026" by month. Calendar days are counted in local time, so midnight, month and year boundaries and daylight-saving changes are right (`src/library/libraryModel.test.ts`).
- The grid covers the editor (an overlay); the editor stays mounted underneath and is `inert`, so its canvas and zoom survive a visit to the grid. A new capture while the grid is open returns to the editor. Esc leaves the grid.
- Not verified (Windows only): the look at 125/150/200% scaling and with a very long Library (checklist, M3).
