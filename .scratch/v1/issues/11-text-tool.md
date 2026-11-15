# 11: Text tool

**What to build:** Andrew clicks with the Text tool and types directly on the image. Text defaults to red with a white outline. In the Style panel Andrew sets the font size (typed 8–200, or picked from 10/12/14/18/24/32/48/72), bold, italic, and the outline (on/off, color, width). Double-clicking edits the text in place, and horizontal handles change the wrap width without changing the font size.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] Uses a Fabric Textbox with the stroke painted first and a doubled stroke width (prototype finding)
- [x] Font and Text outline groups
- [x] T shortcut
- [x] E2E: create text, edit it in place, change the size

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15 (Claude, implementation):

**What was built.**
- Model: `src/core/annotations/text.ts` (`TextAnnotation`: `x`, `y`, `width` = wrap width, `text`, plus the `font` and `textOutline` groups; `textKind`, `clampFontSize`, the 8-200 range and the 10/12/14/18/24/32/48/72 presets). Groups added to `propertyGroups.ts`: `Font { size, bold, italic, color }` and `TextOutline { enabled, color, width }`. Decision: the text's own **color lives in the Font group** (the grilled group table had no home for it; Stroke would have dragged a meaningless thickness in). Defaults: 24 px, red `#e02424`, white outline 2 px.
- Canvas: `src/canvas/shapes/textShape.ts` (`TextShape extends Fabric Textbox`) + `text.ts` adapter. `paintFirst: 'stroke'`, stroke width = 2 x the outline width (so the visible outline is the full chosen width, all outside the letters), round joins. Only the two horizontal handles exist and change `width`, never the font size; the box's top is pinned while re-wrapping (Fabric would otherwise keep the vertical middle fixed and the top would jump). Fabric's "second click on a selected text starts editing" is switched off: a single click selects, a double-click edits. The Export draws the same object through `renderFinished`, no Export code changed.
- New optional extension points (additive): `AnnotationKind.typedInPlace` and a 5th `fromDrag(..., area)` argument (the Capture size, so a click near an edge keeps the box inside); `ShapeAdapter.beginEdit`. For a `typedInPlace` kind the canvas creates the box on click, lets the user type, and only reports `onCreate` when the typing ends with words in it (no empty Annotations; no Edit kind for delete needed). Ticket 18 (Callout) can reuse this.
- An edit that ends with no words restores the previous words (there is no delete here: ticket 13 owns delete).
- Clicking a Style panel control or another field while typing ends the edit first (blur commits), so typed words and the restyle both land.
- Keys while typing: `allowedWhileTyping` in `shortcuts.ts`. In a text field or the text box bare keys never act; of the Ctrl combos only the **view keys** (zoom, fit) stay active. **Deviation from the brief ("Ctrl combos stay active"):** Ctrl+C and Ctrl+Delete deliberately keep their text meaning inside a text field (copy the selected words / delete the next word), so they never copy or discard the image from inside a text box. Ticket 13 should keep this rule when it adds Ctrl+Z / Delete: `allowedWhileTyping` is the one place to decide it.
- Style panel: `src/editor/style/textGroups.tsx` (own file, to keep `groups.tsx` to two added lines): size box, preset list, Bold, Italic, text color, outline on/off, outline color and width.

**Verified on Linux:** vitest 247 tests (new: text kind and round-trip through a Library PNG, Font and Text outline editors, shortcut suspension rules, the editor with the stub canvas), `src/shared/rustParity.test.ts` green, `tsc`, `vite build`, Playwright against real Fabric in Chromium (10 new tests in `e2e/text.spec.ts`; 43 e2e pass in all): click and type with letters that are shortcut keys, nothing saved until typing ends, a click that types nothing, double-click edits in place and a single click does not, emptying keeps the words, typed size / out-of-range ignored / presets / bold / italic / color / outline on, color and width, the right-hand handle changes width and not the font size or position, reload and still editable, Style control clicked mid-typing, Ctrl view keys active and Ctrl+C not copying the image, and the Export: **every pixel of the Export equals the editor canvas composited over the Capture (max difference 2)**, solid `#e02424` letters and a white outline in the PNG with no `snAP` chunk, and a measured outline of the chosen width reaching outside a solid stem (stroke painted first, doubled width). `rustc --test` on `library.rs` and `png_guard.rs` pass (no Rust changed, so no `cargo check` was needed).

**Not verified (Windows only; the new M2 Text items in `docs/release-checklist.md` cover them):** real Segoe UI rendering (Linux Chromium falls back to a sans-serif, so exact letter shapes and widths differ; the pixel-equality check compares editor against Export, which both use the same font); typing, dead keys and IME composition in WebView2 (Fabric's hidden textarea; only Chromium keyboard typing was exercised); the caret and selection feel on the laptop; behavior on scaled monitors.
