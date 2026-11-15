---
status: accepted
---

# Bare Print Screen is watched through Raw Input, not RegisterHotKey

## Context

The capture hotkey is registered with `RegisterHotKey` (through `tauri-plugin-global-shortcut`, which wraps `global-hotkey` 0.8.0: `RegisterHotKey(hwnd, id, MOD_NOREPEAT, VK_SNAPSHOT)`, with the press reported from WM_HOTKEY). On Andrew's managed Windows 11 laptop that never fires for bare Print Screen. `capture.log` shows `hotkey register PrintScreen (parsed as PrintScreen, id 0x75): ok` and Windows' `PrintScreenKeyForSnippingEnabled` is 0, yet pressing the key produces no `hotkey event` line, and Windows still copies all three monitors to the clipboard. `Ctrl+Print Screen` and every other combination work through the same code path, so this is specific to the bare key. Andrew now explicitly wants bare Print Screen to work (it was previously ruled out in ticket 10 together with low-level hooks).

## Decision

While the configured hotkey is exactly bare `PrintScreen`, the app runs a passive Raw Input listener instead of registering it: a hidden message-only window on its own thread that called `RegisterRawInputDevices` for the keyboard (usage page 0x01, usage 0x06) with `RIDEV_INPUTSINK`, and handles WM_INPUT (`GetRawInputData`, `RAWKEYBOARD.VKey == VK_SNAPSHOT`). A press starts a capture through the same entry as the other hotkeys (`capture_async`, so the `busy` guard applies). One physical press is one capture: Windows may deliver only the key-up, or both key-down and key-up, and repeats the key-down while held, so the pure decision logic in `print_screen_key.rs` triggers on the key-down if there is one, otherwise on the key-up, ignores auto-repeat, and debounces a second trigger within 400 ms. Every raw Print Screen event and every decision is written to `capture.log`.

- **Not a hook.** No `SetWindowsHookEx` / `WH_KEYBOARD_LL`, and no `RIDEV_NOLEGACY`. The listener only observes; it never blocks, swallows or changes the key. The app still never writes `PrintScreenKeyForSnippingEnabled` (ticket 08, ticket 10).
- **Only bare Print Screen.** Any combination with a modifier (including `Ctrl+Print Screen`) keeps using `RegisterHotKey`. Bare Print Screen is never registered with both (no double firing). Events with Ctrl, Alt, Shift or a Windows key held are ignored by the listener, matching what `RegisterHotKey` would accept.
- **Fallback.** If the listener cannot start, the failure goes to `capture.log`, bare Print Screen falls back to the normal `RegisterHotKey` registration, and Settings shows the problem like other hotkey failures (the hotkey reports as not registered).
- The Settings warning about Windows' Snipping Tool setting stays: with that setting on, Snipping Tool also opens.

## Consequences

- Windows' own Print Screen action still happens: the full-screen copy goes to the clipboard at the key press (and Snipping Tool opens if its setting is on). The capture's automatic copy (`deliver_capture`) runs only after the user has made a selection in the overlay, so it replaces Windows' copy; the overlay's frozen frames are read from the screen, never the clipboard. Cancelling with Esc leaves Windows' copy on the clipboard. Settings says so next to the hotkey.
- Security or endpoint software that intercepts or blocks Print Screen may still do so; Raw Input cannot get around that, and nothing in this app can (the alternatives are hooks or changing system settings, both out of scope).
- The listener runs a message loop on one extra thread while bare Print Screen is the hotkey, and nothing otherwise. Changing the hotkey starts or stops it, with the same register-first, roll-back-on-failed-save ordering as any other change (`hotkey.rs`).
- The Windows-specific code (`raw_input.rs`) cannot be run on the Linux build machine; it is type-checked there and verified by hand on the laptop (release checklist, M1).
- No network use (ADR 0006).

## Correction (2026-11-15)

Where the Windows setting lives was stated wrongly in the app: on current Windows 11, "Use the Print screen button to open screen capturing" is under Settings > Bluetooth & devices > Keyboard, not Accessibility > Keyboard (on some Windows builds it is still under Accessibility). The Settings warning and notice mentioned above, and the deep link behind "Open Windows setting", now point there. Microsoft documents no `ms-settings:` URI for that exact page, so the link opens Bluetooth & devices (`ms-settings:bluetooth`) and the text says to click Keyboard. The decision above is unchanged. See ticket 29.
