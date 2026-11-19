# Sigil (Screenshot Annotation)

A Windows desktop app for capturing and annotating screenshots, in the style of Snagit (images only, no video). It installs per-user, with no admin rights needed.

> **Status:** Milestones M0 to M5 are released (the latest is v0.6.0). M6 (Desktop demo tools: the laser pointer, drawing mode over the screen and the fixed editor tool keys) is built; v1.0.0 (the version bump included) is not released until the [release checklist](docs/release-checklist.md) has passed on the Windows test PC. Exclusive full-screen games are not supported by the demo tools ([ADR 0009](docs/adr/0009-demo-tool-hotkeys-and-click-through-windows.md)). Decisions are recorded in [.scratch/snagit-clone/map.md](.scratch/snagit-clone/map.md) and [docs/adr/](docs/adr/); terms are in [GLOSSARY.md](GLOSSARY.md).

## Roadmap

| Milestone | Version | State | Adds |
| --- | --- | --- | --- |
| M0 · Skeleton | v0.1 | Built | Per-user installer, tray icon, Settings/About, CI and Releases |
| M1 · Capture → Copy | v0.2 | Built | Hotkey, capture overlay, editor view, Copy, Save as PNG; captures saved to the Library |
| M2 · Annotate | v0.3 | Built | Arrow, Line, Pen, Rectangle, Ellipse, Text; select/edit; undo; sticky styles |
| M3 · Library | v0.4 | Released | Library Strip, full-window grid, reopen and edit, delete with Undo, the folder as the source of truth |
| M4 · Complete | v0.5 | Released | Callout, Highlighter, Blur, Crop and canvas expansion, paste images into the canvas, delay timer, startup and polish |
| M5 · Shortcuts, polish and facelift | v0.6 | Released | Settings lists and remaps all keyboard shortcuts; style panel polish; colour facelift |
| M6 · Desktop demo tools | v1.0 | Built; awaiting the release checklist | Desktop laser pointer and Drawing mode, with two global hotkeys |

## Workflow

1. **Capture**: press Print Screen (fallback `Ctrl+Shift+S`). Drag a region, click a window, or press Space for the whole monitor. There's an optional 3/5/10 s delay. The editor opens instantly.
2. **Annotate**: text, callouts, arrows, lines, freehand pen, rectangles, ellipses, highlighter, pixelate blur, and crop. Everything stays editable.
3. **Copy**: one click puts the finished image on the clipboard. "Save as PNG…" is also available.
4. **Library**: a strip of thumbnails along the bottom of the editor, newest on the left, to browse every past capture; "All captures" opens a full-window grid grouped by date. Click a thumbnail to reopen it with its annotations still editable. Hover a thumbnail for Copy and ✕; Ctrl or Shift+click picks several and Delete removes them. Deleting moves files to the Recycle Bin with no confirmation, and an Undo notice (about 8 seconds) brings them back. Each image is one PNG in `Pictures\Screenshot Annotation\<year-month>` that opens anywhere and stays editable in the app. The folder is the source of truth: delete a file in Explorer and it leaves the Library, drop a PNG in and it appears with no annotations. Thumbnails are a disposable cache under `%LOCALAPPDATA%`, never in Pictures.

## Stack

[Tauri 2](docs/adr/0001-tauri-2-per-user-nsis.md): a React + TypeScript UI with a Fabric.js canvas, and Rust for the Windows integration, shipped as a per-user NSIS installer (no admin). Builds run on GitHub Actions; the Windows test PC only downloads and installs.

## Install and update

Once released (see the [release checklist](docs/release-checklist.md) for how each version is checked): download the latest `Setup.exe` from [Releases](https://github.com/Hunter-Andrew/screenshot-annotation/releases) and run it. No admin is needed. Windows SmartScreen may say "Windows protected your PC"; choose **More info → Run anyway**. To update, run the newer setup over the old one; your Library and settings are kept. The app never connects to the internet.

The installer is not code-signed. To check a download is exactly what the release built, compare its SHA-256 with `SHA256SUMS.txt` on the Release (PowerShell: `Get-FileHash .\<file> -Algorithm SHA256`), or run `gh attestation verify <file> --repo Hunter-Andrew/screenshot-annotation` (GitHub's build provenance record).

## Architecture decisions

| ADR | Title | Status |
| --- | --- | --- |
| [0001](docs/adr/0001-tauri-2-per-user-nsis.md) | Tauri 2 with a per-user NSIS installer | Accepted |
| [0002](docs/adr/0002-non-destructive-blur-and-crop.md) | Blur and crop are non-destructive | Accepted |
| [0003](docs/adr/0003-prewarmed-hidden-windows.md) | Keep overlay and editor windows pre-warmed | Accepted |
| [0004](docs/adr/0004-single-png-with-embedded-editable-data.md) | One PNG per Annotated Image, with editable data embedded | Accepted |
| [0005](docs/adr/0005-app-owned-annotation-model.md) | Annotations use an app-owned model | Accepted |
| [0006](docs/adr/0006-manual-updates-unsigned-no-network.md) | Manual updates from public GitHub Releases; unsigned; no network | Accepted |
| [0007](docs/adr/0007-print-screen-via-raw-input.md) | Bare Print Screen is watched through Raw Input, not RegisterHotKey | Accepted |
| [0008](docs/adr/0008-undo-of-delete-restores-from-a-kept-copy.md) | Undo of a delete writes the file back from a copy the app keeps | Accepted |

## Development

You need Node 22 and, for the desktop app itself, a Rust toolchain and the Windows build tools (the same as [Tauri 2](https://v2.tauri.app/start/prerequisites/)).

```bash
npm ci               # install JavaScript dependencies
npm run dev          # the UI in a browser at http://localhost:1420 with an in-memory fake of the platform
npm run typecheck    # TypeScript
npm test             # unit and component tests (Vitest)
npm run test:e2e     # end-to-end tests in Chromium against the fake platform (Playwright)
npm run tauri dev    # the real desktop app (Windows)
```

```bash
cd src-tauri
cargo test           # Rust tests (CI runs them on Windows)
```

The UI only talks to the operating system through the Platform bridge (`src/platform/bridge.ts`): `tauriBridge.ts` is the real one, `fakeBridge.ts` the in-memory one the tests and `npm run dev` use. The browser build keeps its fake Library and settings in `localStorage`, so a reload behaves like a restart. Work is tracked as local markdown tickets under `.scratch/` (see [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)).

## Releasing

Pushing a `vX.Y.Z` tag runs the same tests and build as every push, then publishes a GitHub Release with the setup `.exe` attached; a failing test blocks the Release. The tag must match the version in `package.json` and `src-tauri/tauri.conf.json`. Before tagging, run the manual [release checklist](docs/release-checklist.md) on the Windows test PC.

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
