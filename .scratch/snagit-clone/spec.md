# Spec: Screenshot Annotation v1

Status: ready-for-agent

Decisions behind this spec are recorded in the planning map (`.scratch/snagit-clone/map.md`), the ADRs in `docs/adr/`, and the vocabulary in `GLOSSARY.md`. Where this spec and an ADR disagree, the ADR wins; raise the conflict.

## Problem Statement

Andrew takes screenshots all day on a locked-down Windows 11 work laptop (3 monitors, no admin rights) and needs to mark them up with arrows, text, boxes and blur, then paste them into Teams and Outlook. Snipping Tool is too limited, and Snagit-style tools either need admin to install or aren't available. Andrew also wants to go back to an earlier screenshot and change its annotations later, which tools that burn annotations into the image can't do.

## Solution

A Windows desktop app that installs per-user with no admin and lives in the system tray:
1. **Capture:** a hotkey freezes the screen and shows an overlay. Andrew drags a region, clicks a window, or takes a whole monitor, and the editor appears instantly.
2. **Annotate:** a Snagit-style editor offers arrows, lines, pen, rectangles, ellipses, text, callouts, highlighter, pixelate blur and crop. Everything stays editable.
3. **Copy:** one click copies the finished image (an Export) to the clipboard.
4. **Library:** every Annotated Image is saved automatically in `Pictures\Screenshot Annotation`. Andrew browses them in a Library Strip along the bottom of the editor or in a full-window grid, reopens any of them with all Annotations still editable, and deletes them easily.

The app makes no network calls. Updates are manual installs from public GitHub Releases.

## User Stories

### Install, run and update
1. As Andrew, I want to install the app without admin rights, so that I can use it on my locked-down work laptop.
2. As Andrew, I want a single setup file from GitHub Releases that I can download without signing in, so that installing is simple.
3. As Andrew, I want the installer to work despite the "Windows protected your PC" screen (via Run anyway), so that an unsigned app is still usable.
4. As Andrew, I want to update by running a newer setup file over the old one, so that I never need an updater or admin rights.
5. As Andrew, I want updates to keep my Library, settings, tool styles and undo history, so that upgrading loses nothing.
6. As Andrew, I want uninstalling to never delete my Library, so that my screenshots are safe.
7. As Andrew, I want an "Also delete app data" option when uninstalling, so that I can clean up settings and history if I choose.
8. As Andrew, I want the app to start at sign-in and sit in the tray, so that the hotkey always works.
9. As Andrew, I want to turn off launch at sign-in in Settings, so that I stay in control.
10. As Andrew, I want only one copy of the app to run at a time, so that launching it twice just brings up the existing one.
11. As Andrew, I want the app to never contact the internet, so that it stays quiet and safe on my work network.
12. As Andrew, I want "Check for updates" to open the Releases page in my browser, so that I can see whether a newer version exists.
13. As Andrew, I want About to show the installed version, so that I know what I'm running.

### Tray and windows
14. As Andrew, I want to left-click the tray icon to open the editor, so that I can get back to my captures quickly.
15. As Andrew, I want a tray menu with Capture, Capture in 3s / 5s / 10s, Open editor, Settings and Exit, so that every main action is one right-click away.
16. As Andrew, I want closing the editor to hide it to the tray rather than quit, so that the hotkey keeps working.
17. As Andrew, I want a one-time notice the first time I close the editor explaining that it's still running in the tray, so that I'm not confused.
18. As Andrew, I want Exit in the tray menu to fully quit, so that I can stop the app when needed.

### Hotkey
19. As Andrew, I want Ctrl+Shift+S to start a capture by default, so that capture works immediately even when Print Screen is taken.
20. As Andrew, I want the app to detect that Windows sends Print Screen to Snipping Tool, so that it can tell me why Print Screen doesn't work.
21. As Andrew, I want a one-time notice with an "Open Windows setting" button that takes me to the right Windows Settings page, so that I can hand Print Screen to this app myself.
22. As Andrew, I want the app to never change that Windows setting behind my back, so that I stay in control.
23. As Andrew, I want to change the capture hotkey in Settings by pressing the combination I want, so that I can pick something comfortable.
24. As Andrew, I want a warning when the combination I pick is already taken by another app, so that I don't end up with a hotkey that doesn't work.

### Capture
25. As Andrew, I want the hotkey to freeze all my monitors instantly, so that menus and tooltips stay visible while I select.
26. As Andrew, I want to drag a region on the frozen screen, so that I capture exactly what I need.
27. As Andrew, I want to hover over a window to highlight it and click to capture it, so that window captures are one click.
28. As Andrew, I want Space to capture the whole monitor under the cursor, so that full-screen captures are quick.
29. As Andrew, I want Esc to cancel a capture, so that an accidental hotkey press is harmless.
30. As Andrew, I want a magnifier near the cursor (toggled with M), so that I can place region edges precisely.
31. As Andrew, I want to see the region's size in pixels while dragging, so that I know how big the capture will be.
32. As Andrew, I want crosshair guides and the area outside my selection dimmed, so that the selection is clear.
33. As Andrew, I want a region to stop at the edge of the monitor where I started dragging, so that every capture comes from a single monitor.
34. As Andrew, I want a window that hangs off the edge of a monitor to be captured only where it's visible on the clicked monitor, so that the rule stays consistent.
35. As Andrew, I want window captures to be a plain rectangle of what's visible, without shadows, so that they look like what I saw.
36. As Andrew, I want the mouse pointer never to appear in captures, so that they look clean.
37. As Andrew, I want releasing the mouse to capture immediately, so that capturing is fast; I fix imprecise edges later with Crop.
38. As Andrew, I want the overlay to appear in under about 150 ms after the hotkey, so that capture feels instant.
39. As Andrew, I want the editor to show my capture in under about 300 ms after release, so that I can annotate straight away.
40. As Andrew, I want a delay timer of 3, 5 or 10 seconds with a countdown near the cursor, so that I can open menus or hover tooltips before the capture.
41. As Andrew, I want to start the delay timer from the tray menu or the editor's top bar, so that it's easy to reach.

### Editor layout
42. As Andrew, I want tools listed down the left side with their names and shortcut keys, so that I can find and learn them.
43. As Andrew, I want the style settings for the selected Annotation or active tool on the right, so that I can adjust them without hunting.
44. As Andrew, I want Discard, Save as PNG… and a prominent Copy button across the top, so that the main actions are always visible.
45. As Andrew, I want the canvas to sit in a neutral background in the center, so that the screenshot stands out.
46. As Andrew, I want a single editor window, with a new capture replacing the current image after auto-saving it, so that I never juggle windows.
47. As Andrew, I want a ⚙ button in the editor that opens Settings, so that I can reach Settings without the tray.

### Annotation tools
48. As Andrew, I want an Arrow tool that draws straight arrows with a head at one end by default, so that I can point at things.
49. As Andrew, I want to switch an arrow to heads at both ends, so that I can show two-way relationships.
50. As Andrew, I want a Line tool for straight lines without heads, so that I can underline or connect things.
51. As Andrew, I want a Pen tool for freehand drawing with light smoothing, so that my strokes don't look shaky.
52. As Andrew, I want Rectangle and Ellipse tools with an outline, a fill, or both, so that I can frame areas.
53. As Andrew, I want a Text tool where I click and type directly on the image, so that adding labels is natural.
54. As Andrew, I want text to default to red with a white outline, so that it reads on any background.
55. As Andrew, I want to turn the text outline on or off and set its color and width, so that I can tune visibility.
56. As Andrew, I want to type any font size from 8 to 200 or pick from common sizes, so that I get exactly the size I want.
57. As Andrew, I want bold and italic text, so that I can add emphasis.
58. As Andrew, I want a Callout tool (boxed text with a pointer tail), so that I can attach notes to things.
59. As Andrew, I want to drag the callout's tail to point anywhere, or switch the tail off, so that one tool covers pointed and plain boxed notes.
60. As Andrew, I want a Highlighter that draws see-through yellow freehand strokes, so that I can mark text like a marker pen.
61. As Andrew, I want to hold Shift with the Highlighter for a straight horizontal stroke, so that highlighting a line of text is neat.
62. As Andrew, I want a Blur tool that pixelates a region, with a strength setting, so that I can hide passwords and personal data safely.
63. As Andrew, I want Crop to change the visible area of the Annotated Image, so that I can trim edges after a quick capture.
64. As Andrew, I want to widen a Crop again later, so that I never lose the original Capture.
65. As Andrew, I want a color palette of 8 plus a custom color picker, so that I can pick colors quickly or precisely.
66. As Andrew, I want to set line thickness from 1 to 30 px with presets 2, 4 and 8, so that strokes are easy to size.
67. As Andrew, I want an opacity setting for fills and the Highlighter, so that I can see through them.
68. As Andrew, I want strokes and text to always be solid, so that they stay readable.
69. As Andrew, I want each tool to remember the last style I used, even after a restart, so that I don't reset colors every time.
70. As Andrew, I want "Reset tool styles to defaults" in Settings, so that I can start over.
71. As Andrew, I want single-key shortcuts (V Select, A Arrow, L Line, P Pen, R Rectangle, E Ellipse, T Text, O Callout, H Highlighter, B Blur, C Crop), so that I can switch tools without the mouse.
72. As Andrew, I want Esc to deselect and return to Select, so that I can get out of any tool quickly.

### Editing Annotations
73. As Andrew, I want to click any existing Annotation to select it, so that I can change it later.
74. As Andrew, I want to move, resize and restyle a selected Annotation, so that I can fix mistakes.
75. As Andrew, I want to double-click text or a callout to edit its words in place, so that corrections are quick.
76. As Andrew, I want Delete to remove the selected Annotation, so that cleaning up is quick.
77. As Andrew, I want bring forward and send back, so that I can control which Annotation sits on top.
78. As Andrew, I want undo and redo for every change, so that I can experiment safely.
79. As Andrew, I want undo history to survive switching images and restarting the app, up to 200 steps per image, so that I can undo work from earlier.
80. As Andrew, I want undo history for images I haven't touched in 2 months to be deleted automatically, so that history doesn't pile up.
81. As Andrew, I want changes saved automatically about a second after I stop, so that I never lose work.

### Copy and save
82. As Andrew, I want Copy (or Ctrl+C with nothing selected) to put the finished image on the clipboard, so that I can paste it into Teams or Outlook.
83. As Andrew, I want copied and saved images to always be plain images, so that what I blurred can never be recovered from them.
84. As Andrew, I want "Save as PNG…" to open a Windows save dialog, so that I can put a copy somewhere else.
85. As Andrew, I want Discard (or Ctrl+Delete) to throw away the current image, so that I can get rid of a mis-captured screenshot in one step.

### Library
86. As Andrew, I want every capture saved to the Library the moment it's taken, so that nothing is ever lost.
87. As Andrew, I want each Annotated Image stored as one PNG that shows the finished image in Explorer and Photos, so that my Library is browsable without the app.
88. As Andrew, I want files organized in monthly folders and named by capture time, so that Explorer stays fast and orderly.
89. As Andrew, I want to reopen any Library image in the app with every Annotation still editable, so that I can change it later.
90. As Andrew, I want a Library Strip of thumbnails along the bottom of the editor, newest on the left, so that recent captures are always one click away.
91. As Andrew, I want the Library Strip to scroll sideways, so that I can reach older captures (about 5 fit at once).
92. As Andrew, I want clicking a thumbnail to open that image after auto-saving the current one, so that switching is safe.
93. As Andrew, I want hovering a thumbnail to show Copy and ✕ buttons, so that I can copy or delete without opening it.
94. As Andrew, I want to select several thumbnails with Ctrl or Shift+click and press Delete, so that cleaning up is fast.
95. As Andrew, I want deletes to go to the Windows Recycle Bin with an Undo notice and no confirmation dialog, so that deleting is quick but recoverable.
96. As Andrew, I want an "All captures" button that switches the window to a full-window grid, so that I can browse older work.
97. As Andrew, I want the grid grouped under date headings (Today, Yesterday, weekday + date, then month), so that I can find captures by when I took them.
98. As Andrew, I want each grid thumbnail to show its time and pixel size, so that I can tell similar captures apart.
99. As Andrew, I want the grid to support the same hover Copy/✕, multi-select delete and Undo as the strip, so that both views behave alike.
100. As Andrew, I want the grid's header to show how many captures I have and how many are selected, with Delete N and Clear selection, so that bulk actions are clear.
101. As Andrew, I want Esc or "Back to editor" to leave the grid, so that I can return to editing.
102. As Andrew, I want an empty state that says to press the hotkey to take a first capture, so that a new install isn't confusing.
103. As Andrew, I want files deleted in Explorer to disappear from the Library, so that the folder is the single source of truth.
104. As Andrew, I want plain PNGs dropped into the folder to appear in the Library as Annotated Images with no Annotations, so that I can annotate images from elsewhere.
105. As Andrew, I want "Open in Explorer" in Settings to open the Library folder, so that I can manage files directly.
106. As Andrew, I want thumbnails cached outside my Pictures folder, so that Pictures holds only my images.
107. As Andrew, I want an image saved by a newer app version to open read-only in an older version, so that nothing gets corrupted when versions differ.

## Implementation Decisions

**Platform and packaging**
- **Stack (ADR 0001):** Tauri 2. The UI is React + TypeScript; Rust handles capture, global hotkey, clipboard, tray, launch at sign-in, Library file I/O and the Recycle Bin.
- **Canvas:** Fabric.js.
- **Packaging:** an NSIS installer in `currentUser` mode.
- **Runtime:** depends on the WebView2 runtime that ships with Windows 11.
- **Distribution (ADR 0006):** a `vX.Y.Z` tag makes GitHub Actions build and publish a public GitHub Release.
  - Ordinary pushes only build and test.
  - The installer is unsigned.
  - No auto-updater and no network calls.

**Installer behavior**
- **Upgrade:** closes the running tray app, installs over it, keeps app data, and relaunches.
- **Uninstall:** never touches the Library; deletes app data only when "Also delete app data" is ticked.

**Deep modules and seams**
- **Annotated Image core** (pure TypeScript, no Tauri or DOM dependency beyond image encoding). The only public operations are:
  - create from a Capture;
  - apply an edit (add, update, delete or reorder an Annotation, set the Crop);
  - undo and redo, with history serialization;
  - encode to a Library PNG, and decode from a Library PNG or plain PNG;
  - produce an Export.
- **Platform bridge.** A single interface the UI calls for every OS service:
  - capture: start the overlay and receive the result;
  - clipboard: write an image;
  - Library: list, read, write atomically, move to the Recycle Bin, restore from Undo, and watch for folder changes;
  - thumbnails;
  - hotkey: register and test for conflicts;
  - settings: read and write;
  - launch at sign-in;
  - the Snipping Tool setting check;
  - opening URLs and Explorer.

  The real implementation calls Tauri commands; tests use an in-memory fake.
- **Rust side behind the bridge:** kept thin, with small Rust tests for naming and folder logic.

**Annotation model** (ADR 0005)
- An app-owned, versioned format, never Fabric's serialization.
- Each Annotation is `{ id, type, …geometry, …property groups }`.
- **Types:** arrow, line, pen, rect, ellipse, text, callout, highlight, blur.
- **Property groups:** Stroke, Fill, Font, Text outline and Arrowheads; each tool opts into the groups it uses.

| Group | Contents |
| --- | --- |
| Stroke | color, width 1–30 |
| Fill | none / solid / semi + opacity |
| Font | size 8–200, bold, italic; Segoe UI only |
| Text outline | on, color, width |
| Arrowheads | end or both |

- **Callout:** adds `tail { on, x, y }`.
- **Blur:** adds a pixelate strength.
- **Crop:** a rectangle on the Annotated Image, not an Annotation.

**Rendering notes from the canvas prototype**
- **Text:** a Fabric Textbox with the stroke painted first and a doubled stroke width gives the outline. Lock vertical scaling; horizontal handles change the wrap width, not the font size.
- **Callout:** Fabric can't edit text inside a Group. Use the Textbox as the selectable object, with a box shape and tail drawn behind it and kept in sync on move, scale and change, plus a draggable tail handle.
- **Blur:** pixelate via Fabric's image filter on a crop of the Capture.

**Storage** (ADR 0004)
- **One PNG per Annotated Image:** `Pictures\Screenshot Annotation\YYYY-MM\YYYY-MM-DD HHmmss.png`, with a `-2`, `-3`… suffix on a name collision.
- **Visible pixels** are the finished image (Annotations rendered, Crop applied, blur pixelated).
- **Embedded data:** a PNG chunk holds the original Capture, the Annotation model, the Crop and a format version.
- **Atomic writes:** write a temp file in the same folder, then replace.
- **Auto-save:** debounced about 1 s.
- **Versioning:** a newer format opens read-only; older formats are upgraded on save.

**Export safety** (ADR 0002 + ADR 0004): Copy and Save as PNG… produce a plain PNG with the embedded chunk removed. The original Capture never leaves the Library.

**Undo history**
- Stored per image in local app data, never in the PNG.
- Up to 200 steps per image.
- Discarded if the PNG changed outside the app (content hash mismatch).
- Deleted with the image, and auto-deleted for images not opened or edited in 60 days.

**Thumbnails:** a disposable cache in local app data, rebuilt from the PNGs.

**Capture**
- **Overlay:** one overlay per monitor, showing a frozen screenshot of all monitors.
  - **Modes:** drag a region, click a highlighted window, or press Space for the monitor under the cursor; Esc cancels.
  - **Aids:** magnifier (toggled with M), pixel dimensions, crosshair, dimming outside the selection.
- **One monitor per capture:** the region clamps to the starting monitor, and a window is clipped to the clicked monitor.
- **Capture result:** a visible-pixels rectangle at native resolution, with no cursor and no window shadow.

**Speed** (ADR 0003): the overlay and editor windows are pre-loaded and kept hidden. Targets: hotkey to overlay < 150 ms; release to editor < 300 ms. The targets are judged manually.

**Hotkey**
- **Default:** Ctrl+Shift+S. Print Screen is available once Windows' Snipping Tool setting is off.
- **Detection:** read the per-user registry value `PrintScreenKeyForSnippingEnabled`, treating it as on unless it is explicitly 0. Don't trust `RegisterHotKey`'s success.
- **Notice:** a one-time notice deep-links to Settings → Accessibility → Keyboard. The app never writes that value.
- **Settings:** a rebindable recorder with a conflict warning.
- **No low-level keyboard hooks.**

**Editor layout** (from the layout prototype, variant A)
- **Top bar:** app name, Capture and in 3s / 5s / 10s on the left; Discard, Save as PNG…, Copy (primary) and ⚙ on the right.
- **Left:** the tool column.
- **Right:** the Style panel.
- **Bottom:** the Library Strip across the full width, ending with an "All captures (N)" button.

**Library grid** (from the Library prototype, variant B)
- Replaces the whole window, hiding the tools, the Style panel and the strip.
- Date-grouped cards of about 230 px.
- A header bar with counts, Delete N, Clear selection, and Back to editor (Esc).

**Settings window:** hotkey; launch at sign-in; Library folder (read-only) with Open in Explorer; Reset tool styles; About with the version and Check for updates.

**Tray**
- Left-click opens the editor.
- The menu has Capture, Capture in 3s / 5s / 10s, Open editor, Settings and Exit.
- Closing the editor hides it, with a one-time notice.

**Build order:** milestones M0 Skeleton (v0.1) → M1 Capture → Copy (v0.2) → M2 Annotate (v0.3) → M3 Library (v0.4) → M4 Complete (v1.0).
- M1 already saves captures in the final format.
- Ticketed as 24 vertical slices in `.scratch/v1/issues/`.

## Testing Decisions

- **What makes a good test:** test only external behavior through the two seams. Assert on what a user or file would observe (models, PNG contents, the clipboard payload, files in the folder, what's on screen), never on internal component state or Fabric object internals.
- **Seam 1: Annotated Image core (unit tests, written test-first):**
  - the model round-trips unchanged through encode and decode;
  - visible pixels match the rendered finished image;
  - an Export never contains the embedded chunk or the original Capture;
  - an older format version opens read-only;
  - the 200-step history cap;
  - history is discarded on a content hash mismatch;
  - 60-day expiry;
  - plain PNGs decode as Annotated Images with no Annotations.
- **Seam 2: UI through the Platform bridge (Playwright end-to-end tests against the web UI, with an in-memory fake bridge):**
  - draw each tool;
  - edit text in place;
  - restyle;
  - undo/redo;
  - Copy writes a plain PNG to the fake clipboard;
  - switch images via the Library Strip;
  - delete with Undo (strip and grid);
  - Discard;
  - grid grouping;
  - the hotkey notice appears when the fake reports Snipping Tool on.
- **Rust:** small tests for file naming and collisions, month folders, atomic replace, and the Recycle Bin call wrapper.
- **CI:** Windows GitHub Actions runs every test on every push; a `v*` tag additionally publishes the Release. A failing test blocks the release.
- **No automated speed checks.**
- **Manual:** a release checklist (`docs/release-checklist.md`) run by Andrew on the work laptop before each release covers what only real hardware shows:
  - upgrade keeps data;
  - capture on all 3 monitors;
  - Teams and Outlook paste;
  - blur pixelated in the pasted image;
  - the tray after closing the editor;
  - sign-out/in;
  - perceived speed.

  Agents remind Andrew to run it (see CLAUDE.md).
- **Prior art:** none in the codebase yet. The throwaway prototype branches (`prototype/konva-vs-fabric`, `prototype/editor-layout`, `prototype/library-window`) show the headless-browser checks used during planning.

## Out of Scope

- **Capture:**
  - video;
  - scrolling or panoramic capture;
  - capturing across more than one monitor at once;
  - capturing the cursor.
- **Tools:**
  - step numbers (a future phase);
  - magnifier and spotlight tools;
  - curved or elbow arrows (permanently);
  - soft or Gaussian blur (permanently pixelate only);
  - "permanently apply blur".
- **Images:**
  - templates, themes and stamps;
  - version history of an Annotated Image beyond undo;
  - OCR.
- **Sharing and sync:**
  - cloud sync and share links;
  - special handling for OneDrive cloud-only files.
- **Platforms:** macOS, Linux and browser versions.
- **Updates and signing:**
  - an auto-updater;
  - code signing (Azure Trusted Signing is the upgrade path if ever needed).
- **Hotkey:** low-level keyboard hooks.
- **Library:**
  - a changeable Library folder in v1;
  - renaming captures in v1.
- **Accessibility** beyond keyboard shortcuts: revisit after v1.

## Further Notes

- **Work laptop:** Windows 11 build 26200, x64, with 3 monitors (one above another, so the virtual screen has negative coordinates).
- **Install test results:** a per-user Tauri NSIS install, launch at sign-in in the current user's registry, capture, writing to Pictures, and pasting the clipboard image into Teams and Outlook were all proven on it.
- **Print Screen:** `RegisterHotKey(PrintScreen)` reports success there but never fires while Snipping Tool owns the key.
- **Development:** happens on Andrew's personal PC and in CI; the work laptop only installs.
- **Repository:** the repo is public.
