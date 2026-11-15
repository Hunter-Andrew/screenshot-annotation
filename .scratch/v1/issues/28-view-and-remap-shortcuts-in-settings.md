# 28: View and remap all shortcuts in Settings

**What to build:** Settings gains a Shortcuts section that lists every keyboard shortcut in the app with its current binding, and lets Andrew remap each one (click the entry, press the new key or combination, the same recorder idea as the capture hotkey). This covers the capture-overlay keys (Space captures the whole monitor under the cursor, Esc cancels, M toggles the magnifier) and the editor's keys (the single-key tool shortcuts, Discard / Ctrl+Delete, undo and redo, and so on), alongside the capture hotkey that is already rebindable. Bindings are stored in `settings.json`, apply to the next capture or at once in the editor, and the keys shown elsewhere in the UI (for example the tool list's shortcut hints and the editor's "Press ... to capture" hint) follow the current bindings. This milestone (M3) was chosen by Andrew on 2026-11-15 during M1 testing.

**Blocked by:** 08 (Hotkey settings and the Print Screen notice), 09 (Side-panel editor and Arrow tool), 27 (Remember the magnifier setting)

**Status:** needs-triage

- [ ] Settings lists every shortcut with its current binding, grouped (Capture, Capture overlay, Editor)
- [ ] Each shortcut can be remapped by pressing the new key or combination; Esc cancels the recording
- [ ] A binding that clashes with another shortcut in the same context is refused with a clear message naming the clash (no silent swap)
- [ ] Bindings persist in `settings.json` and are used by the capture overlay and the editor from then on
- [ ] Every place that shows a shortcut (tool list, hints, tooltips) reflects the current binding
- [ ] "Reset shortcuts to defaults" for one entry and for all
- [ ] A missing or invalid entry in `settings.json` falls back to the default for that shortcut
- [ ] The capture hotkey keeps its existing behavior (global registration, Print Screen handling per ADR 0007); this ticket does not change it
- [ ] Unit tests (written first) for binding validation, clash detection and defaults; e2e with the fake bridge for remapping Space, Esc and M in the overlay and one editor tool key
- [ ] Manual (release checklist): remap M and Space, capture, and the new keys work; restart and they persist

Spec: `.scratch/snagit-clone/spec.md` (story 108).

## Open questions (grill before implementing)

- Which keys may be remapped? Proposal: everything listed above, but Esc keeps one guaranteed way to cancel (it may gain an alias, never lose cancel entirely), so a bad binding cannot trap Andrew in the overlay.
- Single keys vs. combinations: the overlay and tool keys are single keys today. Allow modifiers on them, or single keys only? (Modifier-free keys can clash with typing in the Text tool: the editor must ignore tool keys while a text box is being edited.)
- How are clashes judged across contexts (overlay keys and editor keys are never active together, so the same key may be reused across them)?
- Reuse the capture hotkey recorder, or build a shared shortcut-recorder component (preferred, so the capture hotkey and these use one recorder)?
- The Print Screen key cannot be a normal in-window shortcut (see ADR 0007); is it only valid for the global capture hotkey?
- Where do the bindings live in the Annotation / app-settings model so adding a tool later adds its shortcut automatically (ADR 0005 spirit: cheap to add a tool)?
