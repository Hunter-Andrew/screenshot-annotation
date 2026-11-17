# 23: Tray and Settings completion

**What to build:** The tray menu has Capture, Capture in 3s / 5s / 10s, Open editor, Settings and Exit, and left-clicking the tray icon opens the editor. Closing the editor hides it to the tray, with a one-time notice. Settings gains Launch at sign-in (default on, using HKCU Run), the read-only Library folder with Open in Explorer, and Reset tool styles. The editor's ⚙ opens Settings.

**Blocked by:** 08 (Hotkey settings and the Print Screen notice), 10 (Line, Rectangle and Ellipse with the Style panel)

**Status:** resolved

- [ ] All items work (all implemented and tested against the fake bridge; the Windows behavior of the tray, the close-to-tray notice, the Run key and Explorer is unverified, see Comments)
- [ ] Launch at sign-in survives sign-out/in (manual checklist: implemented, steps added to `docs/release-checklist.md`, not run)
- [x] Reset clears the sticky styles

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Tray menu is built from `tray_menu.rs` (pure, tested): Capture, Capture in 3s/5s/10s, Open editor, Settings, Open log folder, Exit. "Open log folder" was already there and the troubleshooting section of the checklist relies on it, so it stays as an extra item. Left-click opening the editor already existed.
- Close to tray: the editor's `CloseRequested` is now prevented and the window is hidden (`close_editor_to_tray`), which also keeps it loaded for ticket 24. The first time only, a native message box says the app is still in the tray; `settings.json` records it as `trayNoticeShown` (`settings::take_tray_notice`, unit-tested: once, persisted, not repeated in the same run even if the file cannot be written). The editor saves when hidden (its existing visibilitychange flush plus the 1 s auto-save).
- Launch at sign-in: `launchAtSignIn` in `settings.json` (default true, also for older files), the value `Screenshot Annotation` in `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` holding the quoted exe path, no arguments. The rule is `autostart::apply` against a `RunKey` trait (unit-tested with a fake key: add, update a moved install, remove, unchanged writes nothing, errors reported); `HkcuRun` is the real registry. The app re-applies the stored choice at every start of a release build (heals a moved install; a fresh install registers itself; debug builds never touch the key). Settings shows an error and puts the box back if the registry write fails. The NSIS hook `NSIS_HOOK_POSTUNINSTALL` deletes only that one value (the hook tests were updated: still no file or folder deletion).
- Library folder: read-only text field plus "Open in Explorer" (creates the folder first if needed). Reset tool styles: clears `toolStyles` (including the per-tool "Return to Select" choices) and emits `tool-styles-reset`; a loaded editor drops its in-memory styles, cancels a pending write and does not write the old ones back (`Editor.resetStyles.test.tsx`).
- Settings window is taller (480 x 720) for the new sections.
- Verified on Linux: Vitest, Playwright, the pure Rust modules (`settings.rs`, `autostart.rs`, `tray_menu.rs`) in a scratch crate with `cargo test`, `cargo check --target x86_64-pc-windows-gnu`.
- Not verified (Windows only): everything under "Tray, delay timer and Settings" in `docs/release-checklist.md` (native tray menu, close-to-tray and its message box, registry value and Windows' Startup list, sign-out/in, uninstall removing the value, Explorer).
