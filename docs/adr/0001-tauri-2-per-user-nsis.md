---
status: accepted
---

# Tauri 2 with a per-user NSIS installer

The app must install and run on a locked-down Windows 11 work laptop with no admin rights and no extra package downloads. We chose **Tauri 2**: a TypeScript web UI for the editor, with Rust for the Windows-specific parts (capture, global hotkey, clipboard, tray, launch at sign-in). It ships as an **NSIS installer in `currentUser` mode**, built on GitHub Actions. Both Tauri and .NET WPF passed an install-and-run test on the work laptop. Tauri won because ready-made web canvas libraries make the annotation editor (the bulk of the product) much less work.

## Considered Options

- **.NET 8 WPF (self-contained, Inno Setup per-user):** also passed the install test, and its multi-monitor capture is simpler. Rejected because the editor's select/move/resize handles and text editing would all be hand-built.
- **Electron:** heavier than Tauri with no compensating benefit. Dropped at research.
- **Browser app:** rejected; the user wants a desktop app.

## Consequences

- Depends on the WebView2 runtime that ships with Windows 11 (present on the work laptop).
- Region selection across multiple monitors with mixed scaling needs one overlay window per monitor.
- The installer is unsigned for now: SmartScreen shows a "Run anyway" prompt (accepted; see Distribution and updates).
- Development needs Rust and Node on the personal PC or in CI only; nothing is installed on the work laptop except the app.
