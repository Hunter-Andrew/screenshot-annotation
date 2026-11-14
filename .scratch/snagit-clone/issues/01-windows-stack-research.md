# Research: Windows tech stack candidates

Type: research
Status: open
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
