# 08: Hotkey settings and the Print Screen notice

**What to build:** In Settings, Andrew clicks the hotkey field and presses a new combination, and the app warns if it's already taken. If Windows' PrintScreenKeyForSnippingEnabled is not explicitly 0, a one-time notice offers [Open Windows setting], which deep-links to Accessibility → Keyboard, or [Keep Ctrl+Shift+S]. The app never writes that value.

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** resolved

- [ ] The recorder saves and re-registers the hotkey; a conflict shows a warning (UI, fake-bridge flow and Rust swap logic verified; real RegisterHotKey re-registration and a real conflict are unverified on Windows)
- [x] The notice appears once when the setting is on or missing (e2e with the fake bridge; the real registry read is unverified on Windows)
- [ ] The deep link opens the right Settings page (unverified: `ms-settings:easeofaccess-keyboard` via tauri_plugin_opener; not run on Windows)
- [x] No low-level keyboard hooks (only RegisterHotKey via tauri-plugin-global-shortcut; registry access is RegGetValueW read-only, no write)

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Verified on Linux: vitest (hotkey.ts, printScreenNotice.ts, Settings UI via the fake bridge), Playwright e2e (`e2e/hotkey-settings.spec.ts`), tsc, `cargo check --target x86_64-pc-windows-gnu --tests` (stub windres), and the Rust units for `settings.rs`, `hotkey.rs`, `print_screen.rs` (run in a scratch crate because the full crate needs gtk on Linux).
- Not verifiable here: registry read, the `ms-settings:` deep link, real hotkey re-registration, real conflict detection, whether WebView2 delivers Print Screen keyup while recording. Added two M1 items to `docs/release-checklist.md` covering these.
- Settings live in `<app_data_dir>/settings.json` (hotkey, printScreenNoticeDismissed). Default stays Ctrl+Shift+S; Print Screen is user-selectable. The notice opens Settings on first run and is retired by either button. Known: RegisterHotKey on Print Screen "succeeds" while Snipping Tool owns it (ticket 10), so no conflict is reported there; that is what the notice is for.
- The deep link is its own command (`open_keyboard_accessibility_settings`); `url_guard.rs` is unchanged apart from a test that it still refuses `ms-settings:`.
- Known gap: while recording, the current hotkey is still registered, so pressing it triggers a capture.

- Correction (2026-11-15, ticket 29): "Accessibility → Keyboard" above is the wrong place on current Windows 11. The setting is under Settings > Bluetooth & devices > Keyboard; the deep link is now `ms-settings:bluetooth` and the command `open_keyboard_settings` (was `open_keyboard_accessibility_settings`). The "right Settings page" box stays unticked: still unverified on Windows.
