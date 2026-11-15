# 32: Tool icons in the tool column

**What to build:** Every tool in the tool column gets an icon beside its name and shortcut key (icon, label, key), with a clear selected state. Icons also exist for the not-yet-built tools already in the shortcut table (Callout, Highlighter, Blur, Crop), so tickets 18-21 only register behavior.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] Small inline SVG icons, no dependency or network; `currentColor`; 24 px on a 2 px-stroke grid
- [x] All in one module, `src/editor/toolIcons.tsx`, keyed by tool id: Select, Arrow, Line, Pen, Rectangle, Ellipse, Text, Callout, Highlighter, Blur, Crop
- [x] Visible name and key kept next to each icon; accessible name and tooltip "Name (Key)"
- [x] Clear selected state (accent bar, bold name, tint, accent icon)
- [x] A test fails when a tool in the shortcut table has no icon (and when an icon has no tool)
- [x] E2E: every button has an icon, name, key and accessible name; existing tool-by-name tests unchanged

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15 (Claude, implementation):

**What was built.** `src/editor/toolIcons.tsx`: `TOOL_ICONS` (id to SVG body) and `ToolIcon`. The ids are the suffix of the `tool.<id>` rows in the shortcut table (`rect`, `highlight`, ...). `ToolColumn.tsx` renders icon, label and `<kbd>`, with `aria-label` and `title` of the form "Pen (P)" (the key comes from the bindings, so a remapped key from ticket 28 shows up in both). Names still start with the tool's name, so `getByRole("button", { name: /^Pen/ })` in the existing tests works unchanged. The column is 164 px wide (was 132) to fit the icon. Adding a tool: add its kind (ticket 18-21) and nothing here, because its icon is already present.

**Verified on Linux:** `toolIcons.test.tsx` (every `tool.*` shortcut row and every tool-column tool has an icon; no icon without a row; icons are `aria-hidden`, `currentColor`, 20-24 px; button name, tooltip, pressed state), e2e check of icon size, name, key and the single pressed button in Chromium, and a screenshot reviewed by eye (icons crisp at 1x).

## Comments (not verified here)

Windows only, see the M2 item "Tool icons" in `docs/release-checklist.md`: sharpness on scaled monitors (125-200%) in WebView2, the look in light and dark Windows themes, Narrator reading each button once as "Name (Key)". The icons for Callout, Highlighter, Blur and Crop are drawn but not visible anywhere until tickets 18-21 add their tools; their look will be judged then.
