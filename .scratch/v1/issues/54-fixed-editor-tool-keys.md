# 54: Make the editor's Arrow, Rectangle, Pen and Highlighter keys fixed

**What to build:** In the shortcut registry (`src/shared/shortcutRegistry.ts`), mark the editor actions for Arrow (A), Rectangle (R), Pen (P) and Highlighter (H) as not remappable, so they match the fixed drawing-mode keys of ticket 41 decision 4. They disappear from the remap controls in Settings and appear as read-only rows with the "Fixed" marker; saved overrides for them are ignored (they fall back to the defaults). Every other editor tool key stays remappable. No other behaviour changes.

**Blocked by:** nothing (builds on tickets 45 to 48, shipped in v0.6.0).

**Status:** ready-for-agent

Spec: `.scratch/snagit-clone/spec.md`. Decision: Andrew, 2026-11-19. Planned for M6 (v1.0.0).

## Acceptance criteria

- [ ] The four actions are `remappable: false`; the registry invariant tests still pass
- [ ] Settings shows them read-only; a stale override for them in `settings.json` is ignored
- [ ] Unit tests (written first) for the registry and for override loading; the remap e2e still passes with a remappable tool key (for example Line)
- [ ] The release checklist's remap item no longer uses a fixed key
