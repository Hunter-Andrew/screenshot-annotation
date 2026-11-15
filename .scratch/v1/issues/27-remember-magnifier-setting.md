# 27: Remember the magnifier setting

**What to build:** The capture overlay's magnifier (toggled with M) becomes a stored setting. Whatever was last used is used by the next capture, and a fresh install starts with the magnifier on. Settings gains a checkbox, "Show the magnifier in the capture overlay", bound to the same stored value.

**Blocked by:** 05 (Capture overlay: region mode)

**Status:** resolved

- [x] A fresh install (and a `settings.json` without the field) starts with the magnifier on, and it shows as soon as the overlay opens, without a key press
- [x] M toggles it and the new value is stored at once; the next overlay starts in that state
- [x] Every overlay (every monitor) receives the new value, not a bare toggle
- [x] The Settings checkbox reads and writes the same value, and follows a change made with M
- [x] A failed write of `settings.json` keeps the value in memory and logs to `capture.log`; the overlay keeps working
- [ ] On a real Windows machine: the magnifier is on at first start, M is remembered across captures, and the checkbox agrees (manual checklist)

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

Source of truth is Rust: `magnifier` (bool, default true, camelCase in `settings.json`, serde default so older files load as true) in `src-tauri/src/settings.rs`. Commands `get_magnifier` and `set_magnifier` (`lib.rs`) replace `overlay_toggle_magnifier`; `set_magnifier` saves, logs the outcome with `diag::log`, and emits `overlay-magnifier` with the boolean to all windows. Bridge: `getMagnifier`, `setMagnifier`, and `onOverlayMagnifier` now delivers the boolean (`toggleOverlayMagnifier` is gone). The fake bridge keeps it in `fake.magnifier` in its storage (on when absent). Settings UI is a separate `MagnifierSetting.tsx`.

Verified on Linux: vitest (overlay starts on when stored on, off when stored off, on for a fresh fake, M persists and follows another overlay's value, an unreadable setting leaves the overlay working; Settings checkbox default, stored value, writes, follows M), Playwright (`e2e/capture-overlay.spec.ts`: toggle in the overlay then reopen it; Settings checkbox and overlay share the value), `tsc`, `src/shared/rustParity.test.ts`, Rust unit tests for `settings.rs` (default on, old file without the field, camelCase round trip both ways, save failure keeps the value in memory) run in a scratch crate because the full crate needs gtk on Linux, and `cargo check --target x86_64-pc-windows-gnu --tests` with a stub `windres`.

Not verifiable here (Windows only; added to `docs/release-checklist.md`, Capture section, "Magnifier setting"):
- The Tauri `emit` really reaching every overlay window on 3 monitors and the Settings window, and the `invoke`/`listen` payload shapes (`enabled: bool`, `event.payload` as a bool) in a real WebView2. Only compiled, not run.
- `settings.json` written under the real `%APPDATA%` folder and read back after a restart; the write-failure path (read-only or locked file) was exercised only through the scratch-crate unit test.
- That the magnifier looks right on the first frame when the overlay opens already on.

Known limit: overlay windows are still created per capture, so each one reads the stored value when it starts. When ticket 24 pre-warms them (ADR 0003), a reused window must re-read `getMagnifier` each time it is shown.
