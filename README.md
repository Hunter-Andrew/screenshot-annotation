# screenshot-annotation

A cross-platform desktop app for capturing and annotating screenshots, in the style of Snagit (images only, no video).

> **Status:** Design phase. No code yet. See the architecture decision in [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md).

## Workflow

1. **Capture**: press the hotkey (default `Ctrl/Cmd+Shift+2`) and drag a region, click a window, or press Enter for the full screen.
2. **Annotate**: text, callouts, arrows, lines, freehand pen, rectangles, ellipses, highlighter, pixelate blur, and crop. Everything stays editable.
3. **Copy**: one click (or `Ctrl/Cmd+C`) puts the flattened image on the clipboard.
4. **Library**: a strip of thumbnails along the bottom of the editor (expandable to a full grid) to browse every past capture and reopen it; annotations stay editable.

## Stack

[Tauri 2](docs/adr/0001-tauri-2-per-user-nsis.md): a TypeScript UI with Rust for the Windows integration, shipped as a per-user NSIS installer (no admin). Builds run on GitHub Actions; the work laptop only downloads and installs.

## Architecture decisions

| ADR | Title | Status |
| --- | --- | --- |
| [0001](docs/adr/0001-tauri-2-per-user-nsis.md) | Tauri 2 with a per-user NSIS installer | Accepted |
| [0002](docs/adr/0002-non-destructive-blur-and-crop.md) | Blur and crop are non-destructive | Accepted |
| [0003](docs/adr/0003-prewarmed-hidden-windows.md) | Keep overlay and editor windows pre-warmed | Accepted |

## Development

Setup instructions will be added once implementation begins.

## License

See [LICENSE](LICENSE).
