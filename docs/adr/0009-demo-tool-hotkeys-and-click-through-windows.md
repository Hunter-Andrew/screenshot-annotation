---
status: accepted
---

# Two more global hotkeys, and always-on-top click-through windows for the demo tools

## Context

Ticket 28 set the rule that the capture hotkey is the only global registration. The demo tools (tickets 40 and 41: the Laser pointer and Drawing mode) are used while presenting, from any app, so they need to be switched on and off without the editor having focus. ADR 0001 keeps the app a per-user install on a locked-down laptop, and ADR 0007 kept low-level hooks out of the product.

## Decision

- **The rule is widened to exactly three global registrations:** the capture hotkey, the Laser pointer hotkey (default Ctrl+Shift+L) and the Drawing mode hotkey (default Ctrl+Shift+D). The two new ones use the standard `RegisterHotKey` method only (through `tauri-plugin-global-shortcut`), with the same register-first, roll-back-on-failed-save change as the capture hotkey (`hotkey::change_hotkey`). No low-level hooks, no key blocking. The one handler in `lib.rs` has a branch per hotkey.
- **Refused combinations:** Print Screen (bare or with modifiers: it belongs to the capture hotkey and its Raw Input listener, ADR 0007), the capture hotkey, and the other demo hotkey. Another app owning the combination is reported like a capture-hotkey conflict. The capture hotkey likewise cannot take a demo combination. The rules live in `hotkey::demo_refusal` and are mirrored in `src/settings/hotkey.ts`.
- **Windows the demo tools draw into** are small or per-monitor, transparent, always on top and click-through (`WS_EX_TRANSPARENT`, not focusable), so clicks reach the apps below. Drawing mode's overlays take the mouse only while drawing and are click-through in its "Use apps" state. They are excluded from screen captures with `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` (Windows 10 2004 and later), except Drawing mode's drawing overlays, which a Capture deliberately includes.
- **Polling, not hooks.** The pointer position and the left button state are read by polling (about every 16 ms) from the window's own loop (`GetCursorPos`, `GetAsyncKeyState`), never with `WH_MOUSE_LL` or any other hook. The in-window keys of Drawing mode are plain key events of the overlay window itself, not global.

## Consequences

- Two more combinations in the system-wide hotkey table; if another app has one, Settings > Demo tools says so and the app still starts.
- Polling costs a little CPU only while the laser pointer is on.
- Endpoint security software that objects to hooks has nothing new to object to.
- Exclusive full-screen games are unsupported (the windows cannot be placed above them).
- No network use (ADR 0006). The Windows-specific parts cannot be run on the Linux build machine and are covered by the release checklist (ticket 55).
