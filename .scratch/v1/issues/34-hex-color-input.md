# 34: Hex code input for every color control

**What to build:** Andrew (M2 testing) wants to type or paste an exact color. Every color in the editor's Style panel (stroke color, fill color, font color, text outline color) gets a small hex text field next to the palette and the native picker. It shows the current color as `#RRGGBB` and accepts `#RGB` or `#RRGGBB`, with or without the `#`, in any case. One reusable `ColorField` component serves every color control, so a future color control gets the hex option for free. No alpha hex: opacity stays in the Fill opacity control.

**Blocked by:** 10 (Line, Rectangle and Ellipse with the Style panel)

**Status:** resolved

- [x] Pure parse/normalize function `parseHexColor` (valid, invalid, short form, case, whitespace; output matches the model's stored `HEX` format)
- [x] One `ColorField` (optional palette, native picker, hex input) used by Stroke, Fill, Font color and Text outline color
- [x] A valid value applies on Enter or when the field loses focus (a pasted valid color applies at once); an invalid value shows an inline error and never changes the color; leaving the field or Esc puts the current color back
- [x] The field follows the color after a palette click, the native picker, selecting another annotation and undo/redo
- [x] Typing in the field never triggers a tool shortcut, Delete or Undo of the picture (`isTypingTarget`/`allowedWhileTyping` verified with tests)
- [x] Restyling by hex goes through the same edit path as the palette (one undo step, auto-save, sticky tool style, Export)
- [x] E2E (fake bridge, real Fabric): typed stroke and fill hex colors of a rectangle give the exact exported pixels and are remembered after a reload; invalid input leaves the color alone
- [ ] On a real Windows machine: the hex field next to WebView2's native color picker, pasting from the clipboard, and an IME/keyboard layout typing into it (manual checklist)

## Comments

2026-11-15 (Claude, implementation):

**What was built.**
- `src/core/hexColor.ts`: `parseHexColor(input)` returns lower-case `#rrggbb` or null. Trims whitespace, accepts the leading `#` or not, expands `#RGB`, rejects everything else (4 and 8 digit alpha forms, junk, empty). It returns exactly what `HEX` in `propertyGroups.ts` accepts (`HEX` is now exported, and a test ties the two together), so the sanitizer, sticky styles and Export agree with what is typed.
- `src/editor/style/ColorField.tsx`: `ColorField({ label, color, onPick, swatchLabel?, palette? })`, plus the shared `PALETTE` (still re-exported from `groups.tsx`). Controls: palette swatches (`${swatchLabel} #rrggbb`), the native picker (`Custom <label>`), and the hex field (`<label> hex`).
- Commit rule, one for all fields: **Enter or blur applies** (typing live would rewrite "#e02" to "#ee0022" under the caret while on the way to "#e02424"); **paste of a valid color applies at once**; Esc reverts. An invalid draft sets `aria-invalid`, a red field and a visible "Use #RGB or #RRGGBB" alert, and never calls `onPick`; leaving the field restores the current color. Typing the color it already has is not reported (no empty undo step). The field resyncs from the `color` prop on every external change.
- `groups.tsx` (Stroke "Color", Fill "Fill color") and `textGroups.tsx` (Font "Text color", Text outline "Outline color") replace their private `ColorChoice` / `ColorRow` copies with `ColorField`. Existing palette button names are unchanged (the text groups pass `swatchLabel="Color"`), so no existing test or e2e changed.
- Restyle path: `onPick` is the same `onChange` the palette used, so undo (a quick palette-then-hex sequence merges into one step like any quick burst), auto-save and sticky styles need nothing new.
- CSS: `.hex-input`, `.hex-input.invalid`, `.hex-error` in `editor.css`.

**Verified on Linux.** vitest (`hexColor.test.ts` 26, `ColorField.test.tsx` 16, `Editor.hexColor.test.tsx` 7 with the stub canvas: all four color controls have a field, stroke and fill restyle and auto-save in `#rrggbb`, the active tool's style, invalid input, follows palette / selection / undo / redo, one undo step, shortcut letters and Delete/Backspace/Ctrl+Z typed in the field do nothing to the picture; `shortcuts.test.ts` for `isTypingTarget`), `tsc`, `vite build`, Playwright against real Chromium and Fabric (`e2e/hexColor.spec.ts`: typed `#2563EB` stroke and `f80` fill give exported pixels `[37,99,235]` and `[255,136,0]`, restored after a reload; invalid input; shortcut letters typed into the field).

**Not verified (Windows only; added to `docs/release-checklist.md`, Annotate section, "Hex color fields"):** WebView2's native picker next to the field, clipboard paste in the real webview, typing with the real keyboard layout or an IME.

**For later color controls.** Use `ColorField`; do not write another swatch row.
