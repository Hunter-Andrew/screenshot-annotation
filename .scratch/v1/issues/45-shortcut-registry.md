# 45: Shortcut registry (28a)

**What to build:** One TypeScript registry listing every keyboard shortcut: action id, label, context (Capture, Capture overlay, Editor including the grid), default binding, and whether it is fixed or remappable (ticket 28 decisions 1, 6 and 8). The capture overlay, the editor and grid key handlers, the tool list, hints, tooltips and the editor's capture hint all read their keys from it instead of hard-coded keys. No visible change: every key works exactly as today.

**Parent:** ticket 28 (decisions there apply). **Blocked by:** nothing.

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Every current shortcut is in the registry with its context and default; fixed keys (decision 8) are marked
- [ ] Overlay, editor and grid handlers, the tool list, hints and tooltips all read from the registry
- [ ] The capture hotkey stays a Rust-side setting, untouched
- [ ] Unit tests (written first): every action id unique; defaults never clash within a context; fixed keys never remappable
- [ ] All existing unit and e2e tests pass unchanged

Planned for M5 (v0.6.0).
