# screenshot-annotation

A Windows desktop app for capturing and annotating screenshots, in the style of Snagit (images only, no video). It installs per-user, with no admin rights needed.

> **Status:** Planning. No app code yet. Open decisions are tracked in [.scratch/snagit-clone/map.md](.scratch/snagit-clone/map.md); terms are defined in [GLOSSARY.md](GLOSSARY.md).

## Workflow

1. **Capture**: press Print Screen (fallback `Ctrl+Shift+S`). Drag a region, click a window, or press Space for the whole monitor. There's an optional 3/5/10 s delay. The editor opens instantly.
2. **Annotate**: text, callouts, arrows, lines, freehand pen, rectangles, ellipses, highlighter, pixelate blur, and crop. Everything stays editable.
3. **Copy**: one click puts the finished image on the clipboard. "Save as PNG…" is also available.
4. **Library**: a strip of thumbnails along the bottom of the editor (expandable to a full grid) to browse every past capture, reopen it with annotations still editable, and delete in one step. Stored in `Pictures\Screenshot Annotation`.

## Stack

[Tauri 2](docs/adr/0001-tauri-2-per-user-nsis.md): a TypeScript UI with Rust for the Windows integration, shipped as a per-user NSIS installer (no admin). Builds run on GitHub Actions; the work laptop only downloads and installs.

## Architecture decisions

| ADR | Title | Status |
| --- | --- | --- |
| [0001](docs/adr/0001-tauri-2-per-user-nsis.md) | Tauri 2 with a per-user NSIS installer | Accepted |
| [0002](docs/adr/0002-non-destructive-blur-and-crop.md) | Blur and crop are non-destructive | Accepted |
| [0003](docs/adr/0003-prewarmed-hidden-windows.md) | Keep overlay and editor windows pre-warmed | Accepted |

## Development

Setup instructions will be added once implementation begins. The `probes/` folder and `.github/workflows/probes.yml` are throwaway install tests and will be removed.

## License

See [LICENSE](LICENSE).
