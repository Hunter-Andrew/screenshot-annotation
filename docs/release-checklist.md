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
- [ ] **M1** Region mode: dragging draws crosshair guides, dims outside the selection and shows the pixel size; dragging past the edge of the monitor you started on stops the region at that edge (try each edge, towards a neighbouring monitor); releasing captures at once with no adjust step; a click without a drag over the bare desktop captures nothing (over a window it captures that window, see the next item). The magnifier near the pointer is on by default for a fresh install (see the magnifier item below). Esc cancels with nothing saved and the editor comes back if it was open.
- [ ] **M1** Magnifier setting: on a fresh install (no `settings.json`, or one without a `magnifier` field) the magnifier is already showing near the pointer when the overlay opens, before any key press. M toggles it (also when the pressed overlay is on another monitor than the pointer: every overlay follows). Press M to turn it off, Esc, and start a new capture: it is still off; turn it on, capture again: it is on. The "Show the magnifier in the capture overlay" checkbox in Settings agrees with the last M toggle (check it after M, and after reopening Settings), and unticking it makes the next overlay start without the magnifier. `settings.json` in `%APPDATA%\io.github.hunter-andrew.screenshot-annotation` shows `"magnifier": false` or `true` after each change.
- [ ] **M1** Window mode: hovering highlights the window under the pointer (the topmost one where windows overlap: a dialog wins over the window behind it) and shows its pixel size; the bare desktop, a minimised window and a window on another virtual desktop are not highlighted. Clicking captures only that window's visible rectangle: no drop shadow and no invisible resize border (compare the file with the highlight and with the window in Explorer's snap layout; a maximised window must not include the 8 px that hang over the monitor edge), and a part covered by another window shows that window, not the hidden content. Put a window half across the border of two monitors (also across a monitor with different scaling) and click it on each side: each capture holds only the part on the clicked monitor. The overlay windows themselves are never highlighted, and the editor (if it was open) is not offered or in the picture. The file is at native resolution with no mouse pointer.
- [ ] **M1** Region and Space captures are at native resolution (on a scaled monitor the image has the full physical pixel size, not the scaled size: a 300 x 200 pixel size label gives a 300 x 200 file), with no mouse pointer in it, and with the editor itself not in the picture even when it was open on that monitor. The result opens in the editor and is saved to the Library.
- [ ] **M1** Ctrl+Shift+S opens the overlay; Space captures the whole monitor under the mouse pointer (check it on each monitor, and with the pointer on a different monitor than the one the key press reached). Tray menu "Capture" does the same as the hotkey. If Ctrl+Shift+S is taken by another app, the app still starts (the hotkey just does nothing).
- [ ] **M1** Every capture appears in `Pictures\Screenshot Annotation\YYYY-MM\YYYY-MM-DD HHmmss.png` straight away. The file opens in Explorer and Photos showing the capture. Two captures in the same second get `-2` on the second. No `.tmp` files are left behind.
- [ ] **M1** Close the editor, then confirm the hotkey still works from the tray.
- [ ] **M1** Sign out and back in; confirm the tray icon returns.
- [ ] **M1** If capture does nothing: the app now shows an error box naming the problem and the log path, and clears itself after 5 seconds if no overlay appears. Whatever happens, send Claude the log, `%APPDATA%\io.github.hunter-andrew.screenshot-annotation\capture.log` (the tray menu's "Open log folder" opens that folder; an older half is in `capture.log.1`). Press the hotkey once first so the log shows that attempt, then send the whole file.
- [ ] **M1** Hotkey setting: in Settings click the hotkey field, press a new combination (for example Ctrl+Alt+K), and it shows at once and works without a restart (the old combination no longer does). Restart the app: the new hotkey is still in force. Pressing a combination another app owns (try Win+E or a hotkey from another running tool) shows a warning and leaves the old hotkey working.
- [ ] **M1** Print Screen notice: with Windows' "Use the Print screen button to open screen capturing" on, a fresh install opens Settings with the notice. "Open Windows setting" opens Settings > Accessibility > Keyboard (the app writes nothing there; flip the toggle yourself, then record Print Screen as the hotkey and check it opens the overlay and not Snipping Tool). The notice does not come back after either button, and not at all when the toggle was already off. While Print Screen is the hotkey and the toggle is still on, a warning with its own [Open Windows setting] button stays under the hotkey field (also after the notice was answered) and disappears when you come back to Settings with the toggle off. After pressing Print Screen, `capture.log` has a `hotkey event: PrintScreen Pressed` line when the app got the key.
- [ ] **M1** Bare Print Screen (ADR 0007, Raw Input): record Print Screen as the hotkey. (a) With Windows' "Use the Print screen button to open screen capturing" off, one press opens the overlay once (not twice), and capturing a region puts only that region on the clipboard (paste into Paint: the region, not all three monitors; Windows' own full-screen copy happens at the key press and is replaced). Holding the key down does not open a second capture. (b) With the setting on, the overlay opens and Snipping Tool opens as well; Settings keeps its warning and the one-line clipboard note. (c) `Ctrl+Print Screen` recorded as the hotkey still works, and switching between bare Print Screen, `Ctrl+Print Screen` and `Ctrl+Shift+S` in Settings works without a restart and without a double capture (the old one stops). (d) In `capture.log`, one bare press shows `raw input listener started ...` at startup or when selected, then `raw input: PrintScreen make|break flags=... make_code=... modifiers=none t=...ms` lines (Windows may deliver only `break`, or both) each followed by `raw input: PrintScreen decision: trigger (...)` or `decision: ignored (...)`, exactly one `trigger` per press, then `hotkey event: PrintScreen (raw input) -> capture` and `capture requested (hotkey)`. If there is no `raw input: PrintScreen` line at all after a press, Windows or security software kept the key from the app; send Claude the log. A `Raw Input listener failed` line means it fell back to RegisterHotKey and Settings shows the failure.

## Copy and paste

- [ ] **M1** Automatic copy: take a capture, switch straight to Teams, Outlook and Paint (without touching the editor or pressing Copy) and paste into each: the capture arrives as a plain image, cropped to what you selected. The editor shows "Copied to clipboard". Closing and re-opening the editor, or switching images in it, does not change the clipboard (copy something else, re-open the editor, paste: it is still the something else). `capture.log` has a `capture copied to the clipboard` line.
- [ ] **M1** Copy, then paste into Teams: a plain image arrives.
- [ ] **M1** Copy, then paste into Outlook: a plain image arrives.
- [ ] **M1** Save as PNG… opens the Windows save dialog (suggesting the capture time as the name), writes a plain image that opens in another viewer, and Cancel in the dialog writes nothing.
- [ ] **M1** Discard (button and Ctrl+Delete) moves the current image's file out of `Pictures\Screenshot Annotation` into the Recycle Bin (restorable from there), and the editor shows the previous image or the empty state.
- [ ] **M4** Blur is pixelated in the pasted image, not smooth.

## Library

- [ ] **M3** Reopening a past capture from the Library keeps its annotations editable.
- [ ] **M3** Deleting an image goes to the Recycle Bin and Undo restores it.

## Speed

There are no automated speed checks; judge by hand.

- [ ] **M1** Perceived speed feels instant: hotkey to overlay in under about 150 ms.
- [ ] **M1** Perceived speed feels instant: release to editor in under about 300 ms.
- [ ] **M4** Speed still holds with the pre-warmed windows (the targets above), including the first capture after sign-in.

## Troubleshooting: Print Screen and `settings.json`

The app's data folder is `%APPDATA%\io.github.hunter-andrew.screenshot-annotation` (the `identifier` in `src-tauri/tauri.conf.json`). It holds `settings.json` and the diagnostics log `capture.log` (tray menu "Open log folder").

`settings.json` has two fields:

- `hotkey`: the capture hotkey, e.g. `"ctrl+shift+s"` or `"PrintScreen"`. Change it in Settings, not by hand.
- `printScreenNoticeDismissed`: `true` means "you answered the one-time Print Screen notice" (you clicked either of its two buttons). It only stops that notice from showing again. It does not mean Print Screen works or that the Windows setting is off. To see the notice once more, quit the app, set it to `false`, and start the app.

If Print Screen is the hotkey and does nothing: Windows may still be giving the key to Snipping Tool. Settings shows a warning under the hotkey field while that is the case (it reads Windows live and clears itself when you return to the window after turning the setting off). Turn off "Use the Print screen button to open screen capturing" in Windows Settings > Accessibility > Keyboard; the app never changes that setting. If there is no warning and it still does nothing, send Claude `capture.log`: it records every hotkey registration and its result, every `set_hotkey` outcome, every hotkey press the app receives (`hotkey event: ...`), what the hotkey recorder received (`settings page: hotkey recorder: ...`), and the Windows setting reading (`PrintScreenKeyForSnippingEnabled=...`). No `hotkey event` line after pressing the key means Windows did not deliver it to the app. Bare Print Screen is not registered with `RegisterHotKey` at all: it is watched through Raw Input (ADR 0007), so look for `raw input: PrintScreen ...` lines instead; Windows still copies the whole screen to the clipboard when it is pressed, and the capture replaces that copy.

## Before tagging

- [ ] The version in `package.json` and `src-tauri/tauri.conf.json` matches the tag.
- [ ] CI is green on the commit being tagged.
