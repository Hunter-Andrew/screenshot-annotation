# 10: Line, Rectangle and Ellipse with the Style panel

**What to build:** Andrew draws lines, rectangles and ellipses, then restyles any selected Annotation from the Style panel: color (8-color palette plus a custom picker), thickness 1–30 with presets 2/4/8, and fill (none, solid or semi-transparent with opacity). Each tool remembers its last style across restarts.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] Stroke and Fill groups are shared by the tools that opt in
- [ ] Sticky styles persist across restarts (verified end to end with the fake bridge and on the Rust settings file; the real Tauri round trip is Windows-only, see Comments)
- [x] L, R and E shortcuts
- [x] E2E: restyle a selected rectangle

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15 (Claude, implementation):

**What was built.**
- Model: `LineAnnotation` (`x1,y1,x2,y2` + `stroke`), `RectAnnotation` and `EllipseAnnotation` (`x,y,width,height` = the middle of the outline, + `stroke` + `fill`), in `src/core/annotations/{line,rect,ellipse}.ts` (rect and ellipse share `box.ts`). Registered in `annotations/index.ts` and the `Annotation` union. Tool ids are `line`, `rect`, `ellipse`, so the shortcut rows that already existed (L R E) work with no change to `shortcuts.ts`.
- Groups: new `Fill` group in `propertyGroups.ts`: `{ mode: "none" | "solid" | "semi", color, opacity }`. `fillPaint(fill)` is the one place that turns it into a CSS color (used by the canvas and so by the Export). Rect and ellipse opt into `["stroke", "fill"]`, line into `["stroke"]`. The Fill editor is in `src/editor/style/groups.tsx` (`GROUP_EDITORS.fill`); the color swatches are now a shared `ColorChoice` used by Stroke ("Color …") and Fill ("Fill color …").
- Canvas: `lineShape.ts` (end handles, like the Arrow), `boxShapes.ts` for rect and ellipse (stock Fabric `Rect`/`Ellipse`, which also draw the Export). **Resizing uses eight custom controls that set the box from the pointer, not Fabric's scale handles**: with a constant-thickness stroke Fabric's scaling drifted by about 10 px in Chromium (found by the e2e), and the model never has a scale factor this way. Dragging past the opposite edge flips the box.
- Restyle: any selected Annotation from the Style panel (already generic since 09). Unfilled shapes are hit-tested on drawn pixels (`perPixelTargetFind`), so you grab the outline, and an unfilled rectangle does not hide what is under it.
- Sticky styles: `src/editor/stickyStyles.ts` loads them at start (`bridge.getToolStyles`), validates with `sanitizeStyle` (a hand-edited or newer file cannot break the editor; a bad group is dropped, the rest kept), and stores changes about 300 ms after the last one (so dragging the color picker or the opacity slider does not write a file per move), flushing on `pagehide`. Tools this build does not know are written back untouched.
- Settings: `settings.json` gets `toolStyles` (an object keyed by Annotation type; Rust treats it as opaque JSON, so tickets 11/12 need no Rust change), `#[serde(default)]`, and a non-object value is read as empty rather than losing the hotkey. New commands `get_tool_styles` / `set_tool_styles`, bridge methods `getToolStyles` / `setToolStyles`, fake bridge keeps them in `fake.toolStyles`. Documented at the top of `settings.rs`.
- Release checklist: four new M2 items under Annotate (shapes, style panel, fill burned in, sticky styles incl. an old `settings.json`).

**For the other tickets.**
- New group: add its reader to `GROUP_READERS` in `propertyGroups.ts` (it is typed to require every group, so the compiler reminds you) next to its editor in `groups.tsx`; otherwise a stored style for it is simply dropped on read.
- Tool column order is registry order: Arrow, Line, Rectangle, Ellipse, then whatever lands after.
- `Editor.annotate.test.tsx`: the "ignores a key for a tool that does not exist yet" test now uses `B` (Blur) since `L` is a real tool; pick another unbuilt tool's key if Blur lands.

**Verified on Linux.** vitest (335 tests after merging the integration tip with Pen, undo/redo and delete: kinds, `fillPaint`, `sanitizeStyle`, Editor with the stub canvas for shortcuts / groups / restyle / sticky styles incl. a simulated restart and unreadable stored styles, parity test for the new commands), Playwright against real Fabric in Chromium (`e2e/shapes.spec.ts`: draw, move and resize a rectangle, restyle it (color, thickness, solid, semi-transparent, opacity) and reload with it still editable, L and E, sticky styles after a reload, Copy with exact pixels: semi-transparent fill blended at the chosen opacity, solid outline, ellipse fill with an empty box corner, and the renderer burning in a line, solid/semi/none rectangles and an ellipse at native size), `tsc`, `settings.rs` tests (12, run in a scratch crate with serde/serde_json since the full crate needs GTK on Linux: old file without `toolStyles`, round trip, wrong type, failed write kept in memory), `cargo check --target x86_64-pc-windows-gnu` (stub windres).

**Not verified (Windows only; covered by the new M2 checklist items):** the two new Tauri commands running for real and `settings.json` being written under `%APPDATA%`; the restart round trip in the real app (here the "restart" is a page reload against the fake bridge's storage); WebView2's native color picker and range slider; pointer feel of the eight handles on the laptop's scaled displays.
