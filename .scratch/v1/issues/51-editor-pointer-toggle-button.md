# 51: Editor button toggling the global pointer, and its mutual exclusion with tools

**What to build:** The editor's tool column gets a toggle button at the bottom (not a tool; it does not change the selected tool) that switches the global pointer highlight (ticket 50) on and off. It shows pressed while the pointer is on and uses the pointer hotkey in its tooltip. While the global pointer is on, no editor tool is selected (Select included) or usable and clicks on the canvas do nothing. Choosing a tool, by click or key, turns the pointer off. Turning the pointer off, by this button or the hotkey, selects the Select tool.

**Blocked by:** 50.

**Status:** ready-for-agent

Spec: `.scratch/snagit-clone/spec.md`. Decisions: ticket 40 decision 12 (replaces ticket 39). Planned for M6 (v1.0.0).

## Acceptance criteria

- [ ] The button toggles the pointer and reflects its state when it is changed by the hotkey or the tray
- [ ] Pointer on: no tool selected, canvas clicks do nothing; pointer off: Select is selected
- [ ] Picking any tool (click or key) turns the pointer off and selects that tool
- [ ] Unit tests (written first) for the editor state rules; E2E with the fake bridge for each transition
- [ ] The editor opens, closes and undoes exactly as before; existing locators keep working
