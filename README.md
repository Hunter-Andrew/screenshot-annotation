# screenshot-annotation

A Windows desktop app for capturing and annotating screenshots, in the style of Snagit (images only, no video). It installs per-user, with no admin rights needed.

> **Status:** Planning complete; building milestone M0 (skeleton). Decisions are recorded in [.scratch/snagit-clone/map.md](.scratch/snagit-clone/map.md) and [docs/adr/](docs/adr/); terms are in [GLOSSARY.md](GLOSSARY.md).

## Roadmap

| Milestone | Version | Adds |
| --- | --- | --- |
| M0 · Skeleton | v0.1 | Per-user installer, tray icon, Settings/About, CI and Releases |
| M1 · Capture → Copy | v0.2 | Hotkey, capture overlay, editor view, Copy, Save as PNG; captures saved to the Library |
| M2 · Annotate | v0.3 | Arrow, Line, Pen, Rectangle, Ellipse, Text; select/edit; undo; sticky styles |
| M3 · Library | v0.4 | Library Strip, full-window grid, reopen and edit, delete with Undo |
| M4 · Complete | v1.0 | Callout, Highlighter, Blur, Crop and canvas expansion, delay timer, startup and polish |
| M5 · Shortcuts | v1.1 | After v1.0: Settings lists and remaps all keyboard shortcuts |

## Workflow

1. **Capture**: press Print Screen (fallback `Ctrl+Shift+S`). Drag a region, click a window, or press Space for the whole monitor. There's an optional 3/5/10 s delay. The editor opens instantly.
2. **Annotate**: text, callouts, arrows, lines, freehand pen, rectangles, ellipses, highlighter, pixelate blur, and crop. Everything stays editable.
3. **Copy**: one click puts the finished image on the clipboard. "Save as PNG…" is also available.
4. **Library**: a strip of thumbnails along the bottom of the editor (expandable to a full grid) to browse every past capture, reopen it with annotations still editable, and delete in one step. Each image is one PNG in `Pictures\Screenshot Annotation` that opens anywhere and stays editable in the app.

## Stack

[Tauri 2](docs/adr/0001-tauri-2-per-user-nsis.md): a React + TypeScript UI with a Fabric.js canvas, and Rust for the Windows integration, shipped as a per-user NSIS installer (no admin). Builds run on GitHub Actions; the work laptop only downloads and installs.

## Install and update

Once released (see the [release checklist](docs/release-checklist.md) for how each version is checked): download the latest `Setup.exe` from [Releases](https://github.com/Hunter-Andrew/screenshot-annotation/releases) and run it. No admin is needed. Windows SmartScreen may say "Windows protected your PC"; choose **More info → Run anyway**. To update, run the newer setup over the old one; your Library and settings are kept. The app never connects to the internet.

## Architecture decisions

| ADR | Title | Status |
| --- | --- | --- |
| [0001](docs/adr/0001-tauri-2-per-user-nsis.md) | Tauri 2 with a per-user NSIS installer | Accepted |
| [0002](docs/adr/0002-non-destructive-blur-and-crop.md) | Blur and crop are non-destructive | Accepted |
| [0003](docs/adr/0003-prewarmed-hidden-windows.md) | Keep overlay and editor windows pre-warmed | Accepted |
| [0004](docs/adr/0004-single-png-with-embedded-editable-data.md) | One PNG per Annotated Image, with editable data embedded | Accepted |
| [0005](docs/adr/0005-app-owned-annotation-model.md) | Annotations use an app-owned model | Accepted |
| [0006](docs/adr/0006-manual-updates-unsigned-no-network.md) | Manual updates from public GitHub Releases; unsigned; no network | Accepted |

## Development

Setup instructions will be added once implementation begins.

## Releasing

Pushing a `vX.Y.Z` tag runs the same tests and build as every push, then publishes a GitHub Release with the setup `.exe` attached; a failing test blocks the Release. The tag must match the version in `package.json` and `src-tauri/tauri.conf.json`. Before tagging, run the manual [release checklist](docs/release-checklist.md) on the work laptop.

## License

See [LICENSE](LICENSE).

## App icon

`assets/icon-source.png` is the only file to replace to change the logo everywhere. It must be square, at least 512 px (1024 px recommended) and have a transparent background.

1. Replace `assets/icon-source.png` with the new artwork.
2. Run `npm run icons`. It runs `tauri icon` into a temporary folder, copies only the five files the app uses (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`) into `src-tauri/icons/`, and deletes the temporary folder. Nothing else in the repository changes.
3. Run `npm test`. `src/shared/icons.test.ts` fails if the source is not square, is under 512 px or has no transparency, or if any icon file is missing, has no real alpha, or `icon.ico` lacks the 16, 24, 32, 48, 64 and 256 px sizes.
4. Commit `assets/icon-source.png` and `src-tauri/icons/`. The next build uses it everywhere below.

Where the logo is used (all from the files in `src-tauri/icons/`, listed in `bundle.icon` in `tauri.conf.json`):

- The `.exe` file icon, the installer, the desktop shortcut and the entry in Settings > Apps: from `icon.ico`, embedded by `tauri-build` and the NSIS bundler.
- The taskbar and Alt+Tab icon of the editor and Settings windows: every window is created through `new_window` in `src-tauri/src/lib.rs`, which gives it the app icon (`default_window_icon()`, i.e. the `icon.ico` resource in the exe). The capture overlay windows use it too but are not shown in the taskbar. A test fails if a window is created any other way.
- The system tray icon: the same default icon.

Not using the logo yet: there is no logo inside the app's own pages (the Settings About section shows only the name and version, and the editor has none); the setup wizard pages have no logo image or sidebar artwork beyond what the NSIS installer takes from `icon.ico`. Changing the logo does not change the app name.
