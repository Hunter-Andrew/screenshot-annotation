# 42: UI facelift: more colour, bright green and purple

**What to build:** Give the app's own UI (editor, Library Strip and grid, Settings, About, tray-adjacent windows) a visual refresh with more colour, especially bright green and purple, so it pops more. The new logo (`assets/icon-source.png`: a green-to-blue "S" on a dark rounded square with cyan accents) is the starting palette. Requested by Andrew on 2026-11-17.

**Blocked by:** nothing (M4 shipped as v0.5.0).

**Status:** needs-triage

## Open questions (grill before building)

- Palette: the exact bright green and purple, an accent for selected tools and buttons, hover and focus colours; keep or change the current blue (`#2f5bea`)? Must keep sufficient text contrast (WCAG AA) and a visible keyboard focus.
- Light and dark themes: both get the new palette? Today the editor follows the system theme; does the facelift add a theme choice?
- Where colour goes: tool column and selected-tool state, Style panel section headers, top bar (Copy as the primary button), Library Strip selection, grid, Settings, About, toasts; or everywhere?
- Gradients, icons (the tool icons are `currentColor` SVGs: coloured per tool?), rounded corners, shadows: how far to go?
- Does the Annotation palette (the 8 colours, ColorField) change? (Recommended: no, annotation colours are the user's content, not the app's chrome.)
- Scope guard: purely visual, no layout or behaviour changes; existing e2e locators must keep working.

Spec: `.scratch/snagit-clone/spec.md`. Planned for M5 (v0.6.0).
