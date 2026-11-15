# 28: View and remap all shortcuts in Settings

**What to build:** Settings gains a Shortcuts section that lists every keyboard shortcut in the app with its current binding and lets Andrew remap each one that may be remapped: click the entry, press the new key or combination. This covers the capture-overlay keys (Space captures the whole monitor under the cursor, M toggles the magnifier), the editor's tool keys (V, A, L, P, R, E, T, O, H, B, C), Discard (Ctrl+Delete) and the other editor and grid actions, alongside the capture hotkey that is already rebindable. Planned as milestone M5 (v1.1.0), after the v1.0.0 release; decided with Andrew on 2026-11-15 after M1 testing.

**Constraint (Andrew):** a low-risk hotkey add-on in the style of Snagit and Greenshot. In-app shortcuts are handled inside the app's own windows. The only global registration stays the capture hotkey, using the standard Windows method plus the passive Print Screen listener (ADR 0007). No hooks into Windows' hotkey system, no key blocking, no low-level keyboard hooks (ticket 10).

**Blocked by:** the v1.0.0 release (M0 to M4 complete). Directly builds on 08 (Hotkey settings and the Print Screen notice), 09 (Side-panel editor and Arrow tool) and 27 (Remember the magnifier setting).

**Status:** ready-for-agent

## Decisions (grilling, 2026-11-15)

1. **Esc is fixed** (cancel the overlay; deselect and return to Select; leave the grid). Shown as a read-only row.
2. **Key shapes:** a bare key, or a combination with Ctrl, Alt or Shift. Refused: modifier-only keys, Print Screen, anything with the Windows key. The capture hotkey keeps its existing rules.
3. **Contexts and clashes:** Capture (global hotkey), Capture overlay, and Editor (including the grid). A binding clashes only within its own context. A clash is refused with a message naming the other action; never a silent swap.
4. **One shared recorder component** for every row; the capture hotkey row layers its global registration and Print Screen warning on top.
5. **Print Screen** is valid only as the global capture hotkey (ADR 0007); the recorder says so if tried elsewhere.
6. **Storage:** one TypeScript registry lists every shortcut (action id, label, context, default binding). `settings.json` stores overrides only, keyed by action id; an unknown or invalid entry falls back to the default. Settings rows, the tool list, hints and tooltips all read from the registry, so adding a tool adds its shortcut with no Settings changes. The capture hotkey stays a Rust-side setting.
7. **Text editing:** while a text box or input has focus, bare-key and Shift-only shortcuts are suspended; Ctrl and Alt combinations stay active.
8. **Fixed, read-only rows** that can never be assigned elsewhere: Esc, Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Delete, Backspace, Enter, Tab, the arrow keys. Everything else (tool keys, Space, M, Discard, ...) is remappable.
9. **Reset:** per-shortcut reset follows the same no-silent-swap clash rule; "Reset all" always works because defaults never clash.
10. **Changes apply at once everywhere:** saved immediately and sent to every open window (including an open capture overlay), the same way the magnifier setting works; displayed keys update too.

## Acceptance criteria

- [ ] Settings lists every shortcut with its current binding, grouped Capture / Capture overlay / Editor, with fixed shortcuts shown read-only
- [ ] Each remappable shortcut can be changed with the shared recorder; Esc cancels recording
- [ ] Binding rules from decisions 2, 3, 5 and 8 are enforced with clear messages naming the clash or the reason
- [ ] Bindings persist in `settings.json` as overrides only; a missing or invalid entry falls back to the default
- [ ] The overlay and the editor use the current bindings; changes apply at once in every open window
- [ ] Every place that shows a shortcut (tool list, hints, tooltips, the editor's capture hint) reflects the current binding
- [ ] Bare-key and Shift-only shortcuts are suspended while a text input has focus
- [ ] Reset for one entry (refused on clash) and Reset all
- [ ] The capture hotkey and the Print Screen behavior are unchanged
- [ ] Unit tests (written first): validation, clash detection, reserved keys, defaults and override loading. E2E with the fake bridge: remap Space, M and one editor tool key; text-input suspension
- [ ] Manual (release checklist): remap M and Space, capture, and the new keys work; restart and they persist

Spec: `.scratch/snagit-clone/spec.md` (story 108).
