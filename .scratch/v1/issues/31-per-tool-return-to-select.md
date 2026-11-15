# 31: Per-tool "Return to Select after drawing"

**What to build:** Each drawing tool is configurable for whether the editor switches back to the Select tool after one use. Defaults: Pen keeps drawing (stays on Pen); Text, Arrow, Line, Rectangle and Ellipse return to Select (today's behavior). While a drawing tool is active, the Style panel starts with a boxed checkbox "Return to Select after drawing" that sets this for the active tool (never for the selected Annotation). The choice is remembered per tool across restarts. Esc still deselects and returns to Select regardless.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] Pure function `returnsToSelect(tool, choices)` with unit tests (defaults, user choice wins, unknown tool returns, every registered tool has a default)
- [x] Defaults table `DEFAULT_RETURN_TO_SELECT` lives in `src/editor/tools.ts`, next to the tool registry
- [x] Checkbox at the top of the Style panel for the active drawing tool only
- [x] Sticky per tool in `settings.json` `toolStyles.toolBehavior`; old files fall back to the defaults; unknown keys written back untouched; no Rust change
- [x] Esc still returns to Select
- [x] E2E (real Fabric): two Pen strokes without re-picking; a rectangle returns to Select; flipping the option for the Pen and Rectangle flips the behavior; remembered after a reload

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15 (Claude, implementation):

**What was built.**
- `src/editor/toolBehavior.ts` (pure): `returnsToSelect(toolId, chosen)` = the user's choice, else `DEFAULT_RETURN_TO_SELECT[toolId]`, else `true` (a future tool returns to Select unless its row says otherwise); `sanitizeBehavior(raw)` keeps booleans only. `BEHAVIOR_KEY = "toolBehavior"`.
- `src/editor/tools.ts`: `DEFAULT_RETURN_TO_SELECT`. Tickets 18-21 add `callout`, `highlight`, `blur`, `crop` rows there (a unit test already fails if a registered tool has no row).
- Storage: inside the existing `toolStyles` blob under the key `toolBehavior` (`{ "pen": true, "rect": false }`, only tools the user changed). Chosen over a new settings field so no Rust changes are needed. A tool type is never called `toolBehavior`, so it cannot collide with a style entry, and `useStickyStyles` (`src/editor/stickyStyles.ts`) loads it separately from the styles (`rememberBehavior`), writing everything it did not understand back untouched. Non-boolean values are ignored (use the default); a missing key is the old-file case.
- Editor: `onCreate` returns early (tool stays, nothing selected) when the active tool is set to keep drawing; otherwise as before (tool = Select, new Annotation selected). The Style panel checkbox (`StylePanel` prop `toolOption`) shows only for an active drawing tool. While an Annotation is selected under the Select tool, the same-height invisible placeholder is rendered instead, so the controls below do not shift: committing a Text by clicking a Style control moves the tool to Select mid-click, and without the placeholder the panel would jump under the pointer and lose the click (the existing "clicking a Style panel control while typing" e2e caught this).
- The existing Pen e2e now presses `V` after the stroke (the Pen stays active by default).

**Ticket 28 (remapping shortcuts).** The defaults table is next to the tool registry (`tools.ts`), keyed by tool id, not by key or by action. Remapping changes only `Bindings` (action id to key), so it does not touch this table or the stored choices. If 28 adds a per-tool settings list, it can show this option from the same two places (`DEFAULT_RETURN_TO_SELECT` and `toolStyles.toolBehavior`).

**Verified on Linux:** vitest (new: `toolBehavior.test.ts`, `Editor.behavior.test.tsx` with the stub canvas incl. persistence, an old file, garbage values and unknown keys), `src/shared/rustParity.test.ts` green, `tsc`, `vite build`, Playwright with real Fabric in Chromium (`e2e/behavior.spec.ts`).

**Not verified (Windows only; M2 item "Return to Select, per tool" in `docs/release-checklist.md`):** the real `settings.json` written by the Rust side (the fake bridge stores the same JSON object), the look of the checkbox in WebView2 in light and dark themes, behavior across a real quit and restart of the app.
