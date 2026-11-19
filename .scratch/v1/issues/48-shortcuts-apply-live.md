# 48: Shortcut changes apply live; suspended while typing (28d)

**What to build:** A remap or reset is sent at once to every open window, including an open capture overlay and the editor, the same way the magnifier setting is (ticket 28 decision 10); every displayed key (tool list, hints, tooltips) updates too. While a text box or input has focus, bare-key and Shift-only shortcuts are suspended; Ctrl and Alt combinations stay active (decision 7).

**Parent:** ticket 28. **Blocked by:** 47.

**Status:** resolved

## Acceptance criteria

- [ ] A remap in Settings takes effect in an already open editor and overlay without reopening them
- [ ] Displayed keys update in open windows
- [ ] Bare-key and Shift-only shortcuts do nothing while a text input has focus; Ctrl/Alt combinations still work
- [ ] E2E with the fake bridge: remap with the editor open; text-input suspension

Planned for M5 (v0.6.0).

## Answer

Implemented in M5 (v0.6.0) on integration branch `claude/pensive-davinci-z10bb6`; reviewed with `code-review` and fixes applied. Awaiting the Windows manual checklist (`docs/release-checklist.md`) before any release tag.
