# 49: The two demo-tool global hotkeys and the "Demo tools" Settings section

**What to build:** Two new global hotkeys, one for the pointer highlight (default Ctrl+Shift+L) and one for drawing mode (default Ctrl+Shift+D), registered with `RegisterHotKey` only (no hooks, no key blocking; ADRs 0001 and 0007). Settings gets a "Demo tools" section after Shortcuts with a recorder for each, reusing the capture hotkey's register-first, roll-back-on-failed-save behaviour (`hotkey::change_hotkey`). Each hotkey is a Rust-side setting with a default, a get command and a set command; the single handler in `lib.rs` gets a branch per hotkey that, for now, only logs and emits an event the later tickets use. Refused, with a message naming the reason or the other action: Print Screen, the capture hotkey, the other demo hotkey, and anything the plugin reports as taken.

Also record the domain and the decision: add the terms **Pointer highlight** and **Drawing mode** to `GLOSSARY.md`, and an ADR (next number) widening ticket 28's "the capture hotkey is the only global registration" rule to these two hotkeys, and describing the always-on-top click-through demo-tool windows, their exclusion from captures, and the polling (not hook) approach.

**Blocked by:** nothing.

**Status:** ready-for-agent

Spec: `.scratch/snagit-clone/spec.md`. Decisions: tickets 40 and 41 (grilling, 2026-11-19). Planned for M6 (v1.0.0).

## Acceptance criteria

- [ ] Both hotkeys are settings with defaults, persisted in `settings.json`; an invalid or missing value falls back to the default
- [ ] Settings > Demo tools has a recorder for each, with the capture hotkey's conflict and failure messages
- [ ] Print Screen, the capture hotkey and the other demo hotkey are refused with a clear message
- [ ] Unit tests (written first): the validation and clash rules, settings round-trip (Rust tests mirror an existing pattern; no GTK here, so re-read the Rust for compile errors)
- [ ] E2E with the fake bridge: set each hotkey, a clash is refused, a failed registration shows its message
- [ ] GLOSSARY and the new ADR written; no low-level hooks anywhere
