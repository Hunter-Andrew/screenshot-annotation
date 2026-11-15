# 33: Window icons and a one-command icon script

**What to build:** The new logo must be the taskbar and Alt+Tab icon of the editor and Settings windows (Andrew, M2 testing): only the tray set an icon, so windows created at runtime showed a generic Windows one. Every window now gets the app icon from one helper. Andrew also asked whether the logo can be replaced easily: `assets/icon-source.png` is the single source, and `npm run icons` regenerates the icon set from it; a test catches a bad replacement.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] Editor, Settings and overlay windows are all created through one helper (`new_window` in `lib.rs`) that sets `default_window_icon()`; a missing or refused icon is logged and the window is still created (no panic); the tray no longer unwraps the icon either
- [x] A test fails if any other code creates a window with `WebviewWindowBuilder::new`
- [x] `icon.ico` in `bundle.icon` contains the 16, 24, 32, 48, 64 and 256 px sizes (checked with Python PIL and by the new test)
- [x] `npm run icons` regenerates the five used files from `assets/icon-source.png` via a temp folder and cleans up; on the current source it reproduces the committed files byte for byte
- [x] `src/shared/icons.test.ts`: source square and at least 512 px with transparency; every used icon exists, has the right size and real alpha; `.ico` sizes; `src-tauri/icons` holds only the used files; `bundle.icon` lists them
- [x] README "App icon" has the exact steps and every place the logo is used, and what does not use it
- [x] Release checklist item added
- [ ] On a real Windows machine: taskbar and Alt+Tab show the logo for the editor and Settings; installer, desktop shortcut, exe and tray show it (manual checklist)

## Comments

`new_window` builds the window with `.icon(default_window_icon())`. `WebviewWindowBuilder::icon` consumes the builder and returns a `Result`, so the helper keeps a closure that makes the builder and falls back to an icon-less one rather than losing the window. On Windows `default_window_icon()` is the icon resource that `tauri-build` embeds from `icon.ico` (`default_window_icon_from_app_icon_resource`), so `icon.ico` drives the exe, the taskbar and Alt+Tab alike.

Verified on Linux: vitest (all), `tsc`, `cargo check --target x86_64-pc-windows-gnu --tests` with a stub `windres`, PIL read of the `.ico` and PNGs, running `npm run icons` (no diff against the committed icons), and a bad source (opaque, 400 x 300) making `icons.test.ts` fail.

Not verifiable here (Windows only): that the taskbar and Alt+Tab really show the logo for runtime-created windows (the stub `windres` means the real icon resource was not embedded or linked), that the NSIS installer window and shortcuts take `icon.ico` (Tauri's default; `installerIcon` is not set), and how the logo looks at 16 and 24 px on the work laptop. If the taskbar still shows a generic icon, check the resource is in the exe first.
