# Release checklist

Run this by hand on the work laptop before each release (about 10 minutes). Install the setup `.exe` from the candidate build (a CI artifact, or the draft Release), not a local build. Tag `vX.Y.Z` only once everything that applies passes. See [ADR 0006](adr/0006-manual-updates-unsigned-no-network.md).

Each item shows the milestone it applies from: **M0** (v0.1.0), **M1** (v0.2.0), **M2** (v0.3.0), **M3** (v0.4.0), **M4** (v1.0.0). Run every item whose milestone is at or before the release you are checking.

## Install and upgrade

- [ ] **M0** Setup runs with no admin prompt. SmartScreen shows "More info → Run anyway" and the app installs per-user.
- [ ] **M0** The tray icon appears and its menu works; Settings opens and About shows the right version.
- [ ] **M0** "Check for updates" opens the Releases page in the browser. The app makes no other network calls.
- [ ] **M0** Upgrade closes and relaunches the app. Install the previous release, start it (tray icon showing), then run the new setup over it. The setup must not ask you to close the app. When it finishes, the tray icon is back (leave "Run Screenshot Annotation" ticked on the last page), and About shows the new version. Repeat once from a command prompt with `Setup.exe /P` (passive): the app must come back on its own.
- [ ] **M0** If the upgrade shows a reinstall page, leave the default ("Uninstall before installing"). If an uninstall wizard then appears, leave the delete-app-data box ("Delete the application data", our "Also delete app data" option) unticked and carry on. Tell Claude if the wizard appears: it should not need any input.
- [ ] **M1** Upgrade keeps your data. Before upgrading, change a setting, take a capture so `Pictures\Screenshot Annotation` has a file, and note the folders `%APPDATA%\io.github.hunter-andrew.screenshot-annotation` and `%LOCALAPPDATA%\io.github.hunter-andrew.screenshot-annotation`. After upgrading, the setting, the file and both folders are all still there, with unchanged contents.
- [ ] **M2** Upgrade keeps tool styles and undo history: after upgrading, reopen the image you edited and the tool styles are as you left them and Undo still steps back.
- [ ] **M3** Upgrade keeps the thumbnail cache: the Library Strip fills without a visible rebuild, and the cache folder under `%LOCALAPPDATA%\io.github.hunter-andrew.screenshot-annotation` still has its files.
- [ ] **M0** Uninstall without the option: Settings > Apps > Uninstall, leave "Delete the application data" unticked. `Pictures\Screenshot Annotation` is untouched and both app data folders above remain.
- [ ] **M0** Uninstall with the option: reinstall, then uninstall with "Delete the application data" ticked. Both app data folders are gone; `Pictures\Screenshot Annotation` is still untouched.

## Capture

- [ ] **M1** The hotkey opens the overlay on each of the 3 monitors.
- [ ] **M1** Region, window and monitor capture each produce the right image (one monitor per capture).
- [ ] **M1** Close the editor, then confirm the hotkey still works from the tray.
- [ ] **M1** Sign out and back in; confirm the tray icon returns.

## Copy and paste

- [ ] **M1** Copy, then paste into Teams: a plain image arrives.
- [ ] **M1** Copy, then paste into Outlook: a plain image arrives.
- [ ] **M1** Save as PNG… produces a plain image that opens in another viewer.
- [ ] **M4** Blur is pixelated in the pasted image, not smooth.

## Library

- [ ] **M3** Reopening a past capture from the Library keeps its annotations editable.
- [ ] **M3** Deleting an image goes to the Recycle Bin and Undo restores it.

## Speed

There are no automated speed checks; judge by hand.

- [ ] **M1** Perceived speed feels instant: hotkey to overlay in under about 150 ms.
- [ ] **M1** Perceived speed feels instant: release to editor in under about 300 ms.
- [ ] **M4** Speed still holds with the pre-warmed windows (the targets above), including the first capture after sign-in.

## Before tagging

- [ ] The version in `package.json` and `src-tauri/tauri.conf.json` matches the tag.
- [ ] CI is green on the commit being tagged.
