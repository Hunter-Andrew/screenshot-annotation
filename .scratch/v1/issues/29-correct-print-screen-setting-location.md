# 29: Correct where the Print Screen setting is

**What to build:** Andrew found that on his Windows 11 the setting "Use the Print screen button to open screen capturing" is under Settings > Bluetooth & devices > Keyboard, not Accessibility > Keyboard as the app, the docs and tickets 08 and 26 said. The deep link, the command and bridge names, the notice and warning text, the release checklist and ADR 0007 now point at the right place, and say so in words, since the link cannot go all the way.

**Blocked by:** None

**Status:** resolved

- [x] The deep link is a documented `ms-settings:` URI: `ms-settings:bluetooth` (Bluetooth & devices). Microsoft's list has no entry for the Keyboard sub-page, so this is the closest documented page (Microsoft Learn, "Launch the Windows Settings app", source file `hub/apps/develop/launch/launch-settings.md` in MicrosoftDocs/windows-dev-docs, branch `docs`, commit a381231, Devices table: `Bluetooth | ms-settings:bluetooth`; the same list has `ms-settings:easeofaccess-keyboard` only under Ease of Access, i.e. Accessibility)
- [x] The notice and the Print Screen warning say "Bluetooth & devices > Keyboard > Use the Print screen button to open screen capturing", and mention Accessibility > Keyboard only as "on some Windows builds" (vitest on the notice wording, Playwright e2e)
- [x] Command `open_keyboard_settings` and bridge method `openKeyboardSettings` replace the "accessibility" names everywhere (rustParity test checks the Rust command exists, is registered, and is the one the bridge invokes)
- [x] Rust test asserts `SETTINGS_URI` is `ms-settings:bluetooth`; `url_guard` still refuses `ms-settings:`
- [x] Release checklist, ADR 0007 (dated correction), tickets 08, 26 and snagit-clone 10 (dated comments) updated
- [ ] On Windows 11: "Open Windows setting" opens Bluetooth & devices, and Keyboard there holds the toggle (unverified: manual checklist, M1 Print Screen notice)

## Comments

- Verified on Linux: vitest (131), Playwright (18), `tsc --noEmit`, `rustc --test` on `print_screen.rs` (4 tests), `cargo check --offline --target x86_64-pc-windows-gnu --tests` with a stub `x86_64-w64-mingw32-windres`.
- Not verifiable here: that `ms-settings:bluetooth` opens Bluetooth & devices on Andrew's Windows 11 build and that Keyboard is one click from there. Microsoft's page documents the URI but says nothing about the Keyboard sub-page, so no direct link was invented. The "some Windows builds" Accessibility mention rests on secondary guides only (search results, not fetchable here), not on Microsoft's documentation.
- `learn.microsoft.com` itself could not be fetched from the build sandbox (host not allowed); the Learn page's source in the public MicrosoftDocs repository was read instead.
- Left as written: the original wording of tickets 08, 26 and 10, and `.scratch/snagit-clone/spec.md` (history).
