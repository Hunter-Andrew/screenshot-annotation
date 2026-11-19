# 46: Read-only Shortcuts list in Settings (28b)

**What to build:** Settings gains a Shortcuts section listing every shortcut from the registry with its current binding, grouped Capture / Capture overlay / Editor. Fixed shortcuts are visibly read-only. The capture hotkey row is the existing recorder, moved or linked into this section with its behaviour unchanged.

**Parent:** ticket 28. **Blocked by:** 45.

**Status:** resolved

## Acceptance criteria

- [ ] Every registry entry is listed under its group, with its current binding
- [ ] Fixed shortcuts are shown read-only
- [ ] The capture hotkey and the Print Screen behaviour are unchanged
- [ ] No horizontal scroll in Settings at its default size
- [ ] E2E with the fake bridge: the section lists Space, M and a tool key under the right groups

Planned for M5 (v0.6.0).

## Answer

Implemented in M5 (v0.6.0) on integration branch `claude/pensive-davinci-z10bb6`; reviewed with `code-review` and fixes applied. Awaiting the Windows manual checklist (`docs/release-checklist.md`) before any release tag.
