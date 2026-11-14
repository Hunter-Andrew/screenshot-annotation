# Research: Windows tech stack candidates

Type: research
Status: resolved
Blocked by: 

## Question

Compare **Electron**, **Tauri (WebView2)** and **native .NET (WPF or WinUI 3)** against our hard constraints, citing primary sources:
- **Per-user install without admin:** which installer formats install to the user folder (e.g. NSIS per-user, Squirrel, MSIX sideload, ClickOnce, portable). Does Tauri need the WebView2 runtime, and is it preinstalled on Windows 10/11?
- **Capture:** APIs for full screen, a window, and a region across multiple monitors with mixed DPI scaling.
- **Global hotkey:** claiming Print Screen while the Windows 11 'Print Screen opens Snipping Tool' setting is on.
- **Clipboard:** writing a PNG image that Teams and Outlook paste correctly.
- **Annotation canvas:** library options and how much effort the canvas needs.
- **Tray icon and launch at sign-in** without admin.
- **Builds:** building the installer on GitHub Actions `windows-latest` with no local Visual Studio.
- **Footprint:** install size and memory use.
- **Code signing:** what happens to an unsigned installer under SmartScreen.

Recommend a shortlist of at most 2 candidates.

## Answer

Shortlist:
1. **.NET WPF** (self-contained, per-user via Velopack or Inno Setup `PrivilegesRequired=lowest`). Direct Win32 access for capture (PerMonitorV2 BitBlt / Windows.Graphics.Capture), RegisterHotKey, and multi-format clipboard (DIB + "PNG"); builds with the `dotnet` CLI on `windows-latest`. The cost is a hand-built annotation canvas.
2. **Tauri 2** (NSIS `currentUser`, WebView2 preinstalled on Win11 and pushed to Win10). Smallest footprint and a ready canvas (Konva/Fabric), but capture and PNG clipboard need custom Rust/Win32 code.

Electron was dropped: heavier, with no advantage over Tauri. Risks: PrtScn is consumed by the Win11 Snipping Tool setting (a spike is needed; fall back or offer to toggle the HKCU setting), and unsigned installers trigger SmartScreen or may be blocked by corporate policy. Docs could not be re-fetched in this session (network allowlist), so citations are marked ⚠ for re-verification.

Full findings: branch research/windows-stack, file research/windows-stack.md
