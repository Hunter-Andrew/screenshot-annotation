# 03: Installer upgrade and uninstall behavior

**What to build:** Running a newer setup over an old install closes the running tray app, installs, keeps settings, tool styles, history and the thumbnail cache, and relaunches the app. Uninstalling never touches the Library and offers an "Also delete app data" option.

**Blocked by:** 02 (Tag-triggered Releases and release checklist)

**Status:** resolved

- [ ] Upgrade auto-closes the running app and relaunches it afterwards (unverified: implemented in `src-tauri/windows/hooks.nsh`, linted by `src/installer/installerHooks.test.ts`; not run on Windows)
- [ ] App data survives an upgrade (unverified on Windows: no hook deletes anything and Tauri's template only deletes data on uninstall with the box ticked and not in /UPDATE mode; see Comments)
- [ ] Uninstall leaves Pictures\Screenshot Annotation untouched (unverified on Windows; by reading Tauri's installer.nsi it only removes `$APPDATA\<id>` and `$LOCALAPPDATA\<id>`)
- [ ] App data is removed only when "Also delete app data" is ticked (unverified on Windows: uses Tauri's built-in "Delete the application data" checkbox)
- [x] Covered by the release checklist

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Nothing here could be run: NSIS is Windows-only and there is no Windows host. The only executed check is the text lint in `src/installer/installerHooks.test.ts`. The Windows CI `tauri build` step will at least compile the hooks with makensis.
- Built-in behavior reused (read from Tauri's `installer.nsi`, dev branch, not the exact pinned bundler version): the uninstaller's "Delete the application data" checkbox removes `$APPDATA\<identifier>` and `$LOCALAPPDATA\<identifier>` only, and not when `/UPDATE` is set. No hook deletes anything.
- Hooks: PREINSTALL and PREUNINSTALL run `taskkill /F` on the main exe (no prompt); POSTINSTALL relaunches for silent/passive installs without `/R`. In the GUI the finish page's "Run" box (ticked by default) relaunches, so a user who unticks it gets no relaunch. A hook-launched app there would race the finish-page launch.
- Risk, unverified: on a GUI upgrade Tauri's reinstall page defaults to "Uninstall before installing", which runs the old uninstaller wizard (without `/UPDATE`) including the delete-data checkbox, and it deletes the autostart Run value. The first upgrade from 0.1.0 also uses the old uninstaller, which has no hooks. Fixing this needs a custom NSIS `template` and is not done; the checklist tells Andrew to leave the box unticked.
- Future tickets must store settings, tool styles, history and thumbnails under Tauri's `app_data_dir` / `app_local_data_dir` (the `<identifier>` folders) so the checkbox covers them; launch-at-sign-in is removed on uninstall by the template.
