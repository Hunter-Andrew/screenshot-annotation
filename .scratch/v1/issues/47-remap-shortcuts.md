# 47: Remap shortcuts with the shared recorder (28c)

**What to build:** Each remappable row becomes editable with one shared recorder component (ticket 28 decision 4): click, press the new key or combination; Esc cancels recording. Enforce the binding rules (decisions 2, 3, 5 and 8) with messages naming the clash or the reason; never a silent swap. Save overrides only to `settings.json`, keyed by action id; a missing or invalid entry falls back to the default (decision 6). Reset for one entry (refused on clash) and Reset all (decision 9). The editor and the overlay use the saved bindings when they next open.

**Parent:** ticket 28. **Blocked by:** 46.

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Recorder on every remappable row; Esc cancels
- [ ] Refused: modifier-only, Windows-key combinations, Print Screen outside the capture hotkey, fixed keys, clashes within a context; each with a clear message
- [ ] Overrides persist in `settings.json`; unknown or invalid entries fall back to defaults
- [ ] Reset one (refused on clash) and Reset all
- [ ] Unit tests (written first): validation, clash detection, reserved keys, override loading
- [ ] E2E with the fake bridge: remap Space, M and one editor tool key; a clash is refused
- [ ] Release checklist (M5): remap M and Space, capture, and the new keys work; restart and they persist

Planned for M5 (v0.6.0).
