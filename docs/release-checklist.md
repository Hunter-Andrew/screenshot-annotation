# Release checklist

Run this by hand on the work laptop before each release (about 10 minutes). Install the setup `.exe` from the candidate build (a CI artifact, or the draft Release), not a local build. Tag `vX.Y.Z` only once everything that applies passes. See [ADR 0006](adr/0006-manual-updates-unsigned-no-network.md).

Each item shows the milestone it applies from: **M0** (v0.1.0), **M1** (v0.2.0), **M2** (v0.3.0), **M3** (v0.4.0), **M4** (v1.0.0). Run every item whose milestone is at or before the release you are checking.

## Install and upgrade

- [x] **M0** Setup runs with no admin prompt. SmartScreen shows "More info → Run anyway" and the app installs per-user.
- [x] **M0** The tray icon appears and its menu works; Settings opens and About shows the right version.
- [x] **M0** "Check for updates" opens the Releases page in the browser. The app makes no other network calls.
- [x] **M0** Upgrade closes and relaunches the app. Install the previous release, start it (tray icon showing), then run the new setup over it. The setup must not ask you to close the app. When it finishes, the tray icon is back (leave "Run Screenshot Annotation" ticked on the last page), and About shows the new version. Repeat once from a command prompt with `Setup.exe /P` (passive): the app must come back on its own.
- [x] **M0** If the upgrade shows a reinstall page, leave the default ("Uninstall before installing"). If an uninstall wizard then appears, leave the delete-app-data box ("Delete the application data", our "Also delete app data" option) unticked and carry on. Tell Claude if the wizard appears: it should not need any input.
- [ ] **M1** Upgrade keeps your data. Before upgrading, change a setting, take a capture so `Pictures\Screenshot Annotation` has a file, and note the folders `%APPDATA%\io.github.hunter-andrew.screenshot-annotation` and `%LOCALAPPDATA%\io.github.hunter-andrew.screenshot-annotation`. After upgrading, the setting, the file and both folders are all still there, with unchanged contents.
- [ ] **M2** Upgrade keeps tool styles and undo history: after upgrading, reopen the image you edited and the tool styles are as you left them and Undo still steps back.
- [ ] **M3** Upgrade keeps the thumbnail cache: the Library Strip fills without a visible rebuild, and the cache folder under `%LOCALAPPDATA%\io.github.hunter-andrew.screenshot-annotation` still has its files.
- [ ] **M0** Uninstall without the option: Settings > Apps > Uninstall, leave "Delete the application data" unticked. `Pictures\Screenshot Annotation` is untouched and both app data folders above remain.
- [ ] **M0** Uninstall with the option: reinstall, then uninstall with "Delete the application data" ticked. Both app data folders are gone; `Pictures\Screenshot Annotation` is still untouched.

## Capture

- [ ] **M1** The hotkey opens the overlay on each of the 3 monitors, including monitors left of or above the primary (negative virtual-screen coordinates) and monitors with different scaling. Each overlay covers exactly its monitor and shows that monitor's frozen picture, aligned with the real screen (no shift or stretch).
- [ ] **M1** Region, window and monitor capture each produce the right image (one monitor per capture).
- [ ] **M1** Region mode: dragging draws crosshair guides, dims outside the selection and shows the pixel size; dragging past the edge of the monitor you started on stops the region at that edge (try each edge, towards a neighbouring monitor); releasing captures at once with no adjust step; a click without a drag captures nothing. M toggles a magnifier near the pointer (also when the pressed overlay is on another monitor than the pointer). Esc cancels with nothing saved and the editor comes back if it was open.
- [ ] **M1** Region and Space captures are at native resolution (on a scaled monitor the image has the full physical pixel size, not the scaled size: a 300 x 200 pixel size label gives a 300 x 200 file), with no mouse pointer in it, and with the editor itself not in the picture even when it was open on that monitor. The result opens in the editor and is saved to the Library.
- [ ] **M1** Ctrl+Shift+S opens the overlay; Space captures the whole monitor under the mouse pointer (check it on each monitor, and with the pointer on a different monitor than the one the key press reached). Tray menu "Capture" does the same as the hotkey. If Ctrl+Shift+S is taken by another app, the app still starts (the hotkey just does nothing).
- [ ] **M1** Every capture appears in `Pictures\Screenshot Annotation\YYYY-MM\YYYY-MM-DD HHmmss.png` straight away. The file opens in Explorer and Photos showing the capture. Two captures in the same second get `-2` on the second. No `.tmp` files are left behind.
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
