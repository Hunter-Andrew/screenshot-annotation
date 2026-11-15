# 09: Side-panel editor and Arrow tool

**What to build:** The editor uses layout A: the top bar (Discard, Save as PNG…, Copy, ⚙), the tool column on the left with shortcut keys, the Style panel on the right, and the canvas in a neutral well. Andrew draws straight arrows (one head by default, or both), selects them, and moves or resizes them. Edits auto-save about 1 s later into the Library PNG, and reopening the image shows them still editable. This introduces the app-owned Annotation model with the Stroke and Arrowheads groups (ADR 0005).

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** ready-for-agent

- [ ] Unit: Arrow Annotations round-trip through encode/decode
- [ ] E2E: draw an arrow, move it, reload, and it is still editable
- [ ] V and A shortcuts work; Esc deselects
- [ ] Auto-save is debounced about 1 s

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15 (Andrew, from M1 testing on the work laptop): vertical scrolling in the editor feels a little off. Deliberately not fixed in M1 because this ticket replaces the editor layout. When building the side-panel editor, check how the Capture scrolls and fits vertically (tall Captures, window resize, scroll position when switching images) and make it feel right.
