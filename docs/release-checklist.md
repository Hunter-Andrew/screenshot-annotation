# Release checklist

Run this by hand on the work laptop before each release (about 10 minutes). Install the setup `.exe` from the candidate build (a CI artifact, or the draft Release), not a local build. Tag `vX.Y.Z` only once everything that applies passes. See [ADR 0006](adr/0006-manual-updates-unsigned-no-network.md).

Each item shows the milestone it applies from: **M0** (v0.1.0), **M1** (v0.2.0), **M2** (v0.3.0), **M3** (v0.4.0), **M4** (v1.0.0). Run every item whose milestone is at or before the release you are checking. Items marked *(pending ticket 03)* depend on installer behavior that is not built yet; skip them until that ticket lands.

## Install and upgrade

- [ ] **M0** Setup runs with no admin prompt. SmartScreen shows "More info → Run anyway" and the app installs per-user.
- [ ] **M0** The tray icon appears and its menu works; Settings opens and About shows the right version.
- [ ] **M0** "Check for updates" opens the Releases page in the browser. The app makes no other network calls.
- [ ] **M0** *(pending ticket 03)* Running the new setup over the old version closes the running tray app, installs, and relaunches it.
- [ ] **M1** *(pending ticket 03)* Upgrade keeps your data: settings, the Library (`Pictures\Screenshot Annotation`) and history are all still there after installing over the old version.
- [ ] **M2** *(pending ticket 03)* Upgrade keeps tool styles and undo history.
- [ ] **M3** *(pending ticket 03)* Upgrade keeps the thumbnail cache (the Library Strip fills without a visible rebuild).
- [ ] **M0** *(pending ticket 03)* Uninstall leaves `Pictures\Screenshot Annotation` untouched, and removes app data only if "Also delete app data" is ticked.

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
