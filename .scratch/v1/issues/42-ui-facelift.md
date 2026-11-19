# 42: UI facelift: more colour, bright green and purple

**What to build:** Give the app's own UI (editor, Library Strip and grid, Settings, About, tray-adjacent windows) a visual refresh with more colour, especially bright green and purple, so it pops more. The new logo (`assets/icon-source.png`: a green-to-blue "S" on a dark rounded square with cyan accents) is the starting palette. Requested by Andrew on 2026-11-17.

**Blocked by:** nothing (M4 shipped as v0.5.0).

**Status:** resolved

## Open questions (grill before building)

- Palette: the exact bright green and purple, an accent for selected tools and buttons, hover and focus colours; keep or change the current blue (`#2f5bea`)? Must keep sufficient text contrast (WCAG AA) and a visible keyboard focus.
- Light and dark themes: both get the new palette? Today the editor follows the system theme; does the facelift add a theme choice?
- Where colour goes: tool column and selected-tool state, Style panel section headers, top bar (Copy as the primary button), Library Strip selection, grid, Settings, About, toasts; or everywhere?
- Gradients, icons (the tool icons are `currentColor` SVGs: coloured per tool?), rounded corners, shadows: how far to go?
- Does the Annotation palette (the 8 colours, ColorField) change? (Recommended: no, annotation colours are the user's content, not the app's chrome.)
- Scope guard: purely visual, no layout or behaviour changes; existing e2e locators must keep working.

Spec: `.scratch/snagit-clone/spec.md`. Planned for M5 (v0.6.0).

## Decisions (grilling, 2026-11-18)

1. **Palette: option 3** in `.scratch/v1/prototypes/m5-pointer-and-palette.html`: **purple leads, green is the second accent.**
   - Main accent (selected tool, Copy as the primary button, canvas selection handles and border, focus ring): purple. Light theme `#520DF2` (Andrew's pick) with white text; dark theme `#6d32f5` with white text.
   - Second accent (Style panel section headers, toggles, Library Strip and grid selection): green. Light theme `#15803d`; dark theme fills `#22c55e`, text `#4ade80`.
   - The old blue `#2f5bea` goes everywhere, including `src/canvas/shapes/lineShape.ts` and `boxShapes.ts`.
2. **Every colour pair meets WCAG AA**; keyboard focus stays clearly visible.
3. **Both themes** get the palette; the app keeps following the system theme (no theme picker).
4. **Every window:** editor, Library Strip and grid, Settings, About, toasts.
5. **Flat:** no gradients, no per-tool icon colours.
6. **Visual only:** no layout or behaviour changes; existing e2e locators keep working.
7. **The Annotation palette (the 8 colours, ColorField) is unchanged:** annotation colours are the user's content, not the app's chrome.
8. **Built last in M5**, after 43, 44 and 28, so it restyles the finished UI once.

## Build note

Define the palette once as shared CSS variables (light and dark), replacing `--accent: #2f5bea` in `src/editor/editor.css` and the hard-coded `#2f5bea` in `src/canvas/shapes/lineShape.ts` and `boxShapes.ts`. Then apply it window by window (editor, Library Strip and grid, Settings, About, toasts), checking AA contrast and the focus ring in both themes after each window.

## Answer

Implemented in M5 (v0.6.0) on integration branch `claude/pensive-davinci-z10bb6`; reviewed with `code-review` and fixes applied. Awaiting the Windows manual checklist (`docs/release-checklist.md`) before any release tag.
