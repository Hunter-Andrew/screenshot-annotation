# Release checklist

Run this by hand on the work laptop before each release (about 10 minutes). Install the setup `.exe` from the candidate build (a CI artifact, or the draft Release), not a local build. Tag `vX.Y.Z` only once everything that applies passes. See [ADR 0006](adr/0006-manual-updates-unsigned-no-network.md).

Each item shows the milestone it applies from: **M0** (v0.1.0), **M1** (v0.2.0), **M2** (v0.3.0), **M3** (v0.4.0), **M4** (v1.0.0). Run every item whose milestone is at or before the release you are checking.

## Install and upgrade

- [x] **M0** Setup runs with no admin prompt. SmartScreen shows "More info → Run anyway" and the app installs per-user.
- [x] **M0** The tray icon appears and its menu works; Settings opens and About shows the right version.
- [x] **M0** "Check for updates" opens the Releases page in the browser. The app makes no other network calls.
- [x] **M0** Upgrade closes and relaunches the app. Install the previous release, start it (tray icon showing), then run the new setup over it. The setup must not ask you to close the app. When it finishes, the tray icon is back (leave "Run Screenshot Annotation" ticked on the last page), and About shows the new version. Repeat once from a command prompt with `Setup.exe /P` (passive): the app must come back on its own.
- [x] **M0** If the upgrade shows a reinstall page, leave the default ("Uninstall before installing"). If an uninstall wizard then appears, leave the delete-app-data box ("Delete the application data", our "Also delete app data" option) unticked and carry on. Tell Claude if the wizard appears: it should not need any input.
- [x] **M1** Upgrade keeps your data. Before upgrading, change a setting, take a capture so `Pictures\Screenshot Annotation` has a file, and note the folders `%APPDATA%\io.github.hunter-andrew.screenshot-annotation` and `%LOCALAPPDATA%\io.github.hunter-andrew.screenshot-annotation`. After upgrading, the setting, the file and both folders are all still there, with unchanged contents.
- [ ] **M2** Upgrade keeps tool styles and undo history: after upgrading, reopen the image you edited and the tool styles are as you left them and Undo still steps back.
- [ ] **M3** Upgrade keeps the thumbnail cache: the Library Strip fills without a visible rebuild, and the cache folder under `%LOCALAPPDATA%\io.github.hunter-andrew.screenshot-annotation` still has its files.
- [x] **M0** Uninstall without the option: Settings > Apps > Uninstall, leave "Delete the application data" unticked. `Pictures\Screenshot Annotation` is untouched and both app data folders above remain.
- [x] **M0** Uninstall with the option: reinstall, then uninstall with "Delete the application data" ticked. Both app data folders are gone; `Pictures\Screenshot Annotation` is still untouched.

## Capture

- [x] **M1** The hotkey opens the overlay on each of the 3 monitors, including monitors left of or above the primary (negative virtual-screen coordinates) and monitors with different scaling. Each overlay covers exactly its monitor and shows that monitor's frozen picture, aligned with the real screen (no shift or stretch).
- [x] **M1** Region, window and monitor capture each produce the right image (one monitor per capture).
- [x] **M1** Region mode: dragging draws crosshair guides, dims outside the selection and shows the pixel size; dragging past the edge of the monitor you started on stops the region at that edge (try each edge, towards a neighbouring monitor); releasing captures at once with no adjust step; a click without a drag over the bare desktop captures nothing (over a window it captures that window, see the next item). M toggles a magnifier near the pointer (also when the pressed overlay is on another monitor than the pointer). Esc cancels with nothing saved and the editor comes back if it was open.
- [x] **M1** Window mode: hovering highlights the window under the pointer (the topmost one where windows overlap: a dialog wins over the window behind it) and shows its pixel size; the bare desktop, a minimised window and a window on another virtual desktop are not highlighted. Clicking captures only that window's visible rectangle: no drop shadow and no invisible resize border (compare the file with the highlight and with the window in Explorer's snap layout; a maximised window must not include the 8 px that hang over the monitor edge), and a part covered by another window shows that window, not the hidden content. Put a window half across the border of two monitors (also across a monitor with different scaling) and click it on each side: each capture holds only the part on the clicked monitor. The overlay windows themselves are never highlighted, and the editor (if it was open) is not offered or in the picture. The file is at native resolution with no mouse pointer.
- [x] **M1** Region and Space captures are at native resolution (on a scaled monitor the image has the full physical pixel size, not the scaled size: a 300 x 200 pixel size label gives a 300 x 200 file), with no mouse pointer in it, and with the editor itself not in the picture even when it was open on that monitor. The result opens in the editor and is saved to the Library.
- [x] **M1** Ctrl+Shift+S opens the overlay; Space captures the whole monitor under the mouse pointer (check it on each monitor, and with the pointer on a different monitor than the one the key press reached). Tray menu "Capture" does the same as the hotkey. If Ctrl+Shift+S is taken by another app, the app still starts (the hotkey just does nothing).
- [x] **M1** Every capture appears in `Pictures\Screenshot Annotation\YYYY-MM\YYYY-MM-DD HHmmss.png` straight away. The file opens in Explorer and Photos showing the capture. Two captures in the same second get `-2` on the second. No `.tmp` files are left behind.
- [x] **M1** Close the editor, then confirm the hotkey still works from the tray.
- [ ] **M1** Sign out and back in; confirm the tray icon returns.
- [ ] **M1** If capture does nothing: the app now shows an error box naming the problem and the log path, and clears itself after 5 seconds if no overlay appears. Whatever happens, send Claude the log, `%APPDATA%\io.github.hunter-andrew.screenshot-annotation\capture.log` (the tray menu's "Open log folder" opens that folder; an older half is in `capture.log.1`). Press the hotkey once first so the log shows that attempt, then send the whole file.
- [x] **M1** Hotkey setting: in Settings click the hotkey field, press a new combination (for example Ctrl+Alt+K), and it shows at once and works without a restart (the old combination no longer does). Restart the app: the new hotkey is still in force. Pressing a combination another app owns (try Win+E or a hotkey from another running tool) shows a warning and leaves the old hotkey working.
- [ ] **M1** Print Screen notice: with Windows' "Use the Print screen button to open screen capturing" on, a fresh install opens Settings with the notice. "Open Windows setting" opens Settings at Bluetooth & devices (`ms-settings:bluetooth`; Microsoft documents no link straight to the Keyboard page); click Keyboard, and "Use the Print screen button to open screen capturing" is on that page (on some Windows builds it is under Accessibility > Keyboard instead). The app writes nothing there; flip the toggle yourself, then record Print Screen as the hotkey and check it opens the overlay and not Snipping Tool). The notice does not come back after either button, and not at all when the toggle was already off.

## Copy and paste

- [x] **M1** Copy, then paste into Teams: a plain image arrives.
- [x] **M1** Copy, then paste into Outlook: a plain image arrives.
- [x] **M1** Save as PNG… opens the Windows save dialog (suggesting the capture time as the name), writes a plain image that opens in another viewer, and Cancel in the dialog writes nothing.
- [x] **M1** Discard (button and Ctrl+Delete) moves the current image's file out of `Pictures\Screenshot Annotation` into the Recycle Bin (restorable from there), and the editor shows the previous image or the empty state.
- [ ] **M4** Blur is pixelated in the pasted image, not smooth.

## Annotate

M2 has the Arrow, Text and Pen tools; the other tools add their own items as they arrive.

- [ ] **M2** Draw an arrow: take a capture, press `A` (or click Arrow in the tool column), drag on the image. The arrow appears, stays selected (the Style panel on the right shows Stroke and Arrowheads), and the tool goes back to Select. Switch it to "Both ends" and back to "One end".
- [ ] **M2** Move and resize an arrow: click it (a thin arrow is easy to hit, a click beside it selects nothing), drag the line to move it, drag either end handle to resize or re-aim it. Esc deselects and returns to Select; `V` and `A` switch tools.
- [ ] **M2** Restyle an arrow: with it selected, change its color (palette and the custom picker) and its thickness (presets 2/4/8 and typing 1 to 30); the arrow changes at once.
- [ ] **M2** Auto-save and reopen: edit an arrow and wait about a second (the status line says "All changes saved"). Open the file in `Pictures\Screenshot Annotation` in Explorer or Photos: the arrow is burned into the picture. Quit from the tray menu, start the app again, and open the editor from the tray: it shows that image with the arrow still selectable and movable.
- [ ] **M2** Copy has the arrow burned in: Copy, then paste into Teams and into Outlook; Save as PNG… and open the file in another viewer. Both show the arrow, and both are plain pictures (no editable data inside: the file is about the size of a normal screenshot, not 2x).
- [ ] **M2** Discard right after drawing: draw an arrow and click Discard at once. The file is gone from `Pictures\Screenshot Annotation` and does not come back a few seconds later.
- [ ] **M2** Text, create and type: take a capture, press `T` (or click Text in the tool column), click on the image and type a sentence straight onto it. The text is red with a white outline, in Segoe UI, and the caret blinks in place. Letters that are also shortcut keys (`t`, `a`, `v`, `e`...) just type; they must not switch tools. `Esc` (or a click elsewhere on the image) ends the typing: the text stays selected (Style panel shows Font and Text outline) and the tool is back to Select. A click that types nothing leaves nothing behind. Also type with your real keyboard layout and an IME if you use one (accents, dead keys, Japanese or Chinese composition): the characters arrive correctly and the box does not jump.
- [ ] **M2** Text, edit in place: click the text once (it only selects), double-click it (the caret appears and you can edit; select words with the mouse, Ctrl+A, Ctrl+C and Ctrl+V work inside the box as text, and do not copy or paste the image). Delete every letter and press `Esc`: the old words come back (no empty text is kept). Drag the round handle on the left or right edge: the text re-wraps to the new width and the letters keep their size. Drag the text itself to move it.
- [ ] **M2** Text, style: with a text selected (or the Text tool active) set the font size by typing (8 to 200; 7 or 201 is ignored) and from the preset list (10, 12, 14, 18, 24, 32, 48, 72); switch Bold and Italic; change the text color; switch the outline off and on and change its color and width (1 to 10). The text changes at once and the outline looks clean around the letters (no spikes on sharp corners, the letters themselves are not thinned). Clicking a Style panel control while still typing keeps the typed words and applies the style.
- [ ] **M2** Text, save and burn-in: edit a text, wait about a second ("All changes saved"), quit from the tray menu, start the app and open the editor: the text is there with the same look and is still editable (double-click). Copy and paste into Teams and Outlook, and Save as PNG…: the text, outline included, looks the same as in the editor (same letter shapes, same outline), and the files are plain pictures.
- [ ] **M2** Pen: press `P` (or click Pen in the tool column) and draw a freehand stroke with the mouse, then with the pen or touch of the work laptop if it has one. The stroke follows the pointer without lag, looks lightly smoothed (no jagged steps, no visible rounding-off of deliberate corners), and the tool goes back to Select with the stroke selected (the Style panel shows Stroke only, no Arrowheads). A plain click draws nothing. Drag the stroke to move it; change its color and thickness (it changes at once).
- [ ] **M2** Pen burn-in and reopen: copy a picture with a pen stroke (paste into Teams and Outlook, and Save as PNG…): the stroke looks the same as on screen. Quit and restart the app, open the editor from the tray: the stroke is still selectable and movable.
- [ ] **M2** Editor layout: top bar (Capture on the left; Discard, Save as PNG…, Copy and the gear on the right), tool column on the left with the shortcut keys, Style panel on the right, the image in a grey well. The gear opens Settings.
- [ ] **M2** Fit and scrolling (Andrew's note from M1 testing): a very tall capture (for example a full web page) is shown whole in the window with nothing to scroll; resizing the window refits it. Click "100%": the well scrolls from the very top to the very bottom of the picture, and Zoom in/out (or Ctrl and the mouse wheel) keeps the middle of the view where it was. Take or discard another capture: the new one starts fitted and at the top, not at the old scroll position. The window itself never scrolls (the status line stays visible at the bottom).

## Library

- [ ] **M3** Reopening a past capture from the Library keeps its annotations editable.
- [ ] **M3** Deleting an image goes to the Recycle Bin and Undo restores it.

## Speed

There are no automated speed checks; judge by hand.

- [x] **M1** Perceived speed feels instant: hotkey to overlay in under about 150 ms.
- [x] **M1** Perceived speed feels instant: release to editor in under about 300 ms.
- [ ] **M4** Speed still holds with the pre-warmed windows (the targets above), including the first capture after sign-in.

## Troubleshooting: Print Screen and `settings.json`

The app's data folder is `%APPDATA%\io.github.hunter-andrew.screenshot-annotation` (the `identifier` in `src-tauri/tauri.conf.json`). It holds `settings.json` and the diagnostics log `capture.log` (tray menu "Open log folder").

`settings.json` has two fields:

- `hotkey`: the capture hotkey, e.g. `"ctrl+shift+s"` or `"PrintScreen"`. Change it in Settings, not by hand.
- `printScreenNoticeDismissed`: `true` means "you answered the one-time Print Screen notice" (you clicked either of its two buttons). It only stops that notice from showing again. It does not mean Print Screen works or that the Windows setting is off. To see the notice once more, quit the app, set it to `false`, and start the app.

If Print Screen is the hotkey and does nothing: Windows may still be giving the key to Snipping Tool. Settings shows a warning under the hotkey field while that is the case (it reads Windows live and clears itself when you return to the window after turning the setting off). Turn off "Use the Print screen button to open screen capturing" in Windows Settings > Bluetooth & devices > Keyboard (on some Windows builds, Accessibility > Keyboard); the app never changes that setting. If there is no warning and it still does nothing, send Claude `capture.log`: it records every hotkey registration and its result, every `set_hotkey` outcome, every hotkey press the app receives (`hotkey event: ...`), what the hotkey recorder received (`settings page: hotkey recorder: ...`), and the Windows setting reading (`PrintScreenKeyForSnippingEnabled=...`). No `hotkey event` line after pressing the key means Windows did not deliver it to the app. Bare Print Screen is not registered with `RegisterHotKey` at all: it is watched through Raw Input (ADR 0007), so look for `raw input: PrintScreen ...` lines instead; Windows still copies the whole screen to the clipboard when it is pressed, and the capture replaces that copy.

## Before tagging

- [ ] The version in `package.json` and `src-tauri/tauri.conf.json` matches the tag.
- [ ] CI is green on the commit being tagged.
