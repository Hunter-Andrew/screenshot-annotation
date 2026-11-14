# Task: Prove a per-user install works on the work laptop

Type: task
Status: resolved
Blocked by: 01

## Question

For each shortlisted stack, CI builds a hello-world per-user installer that registers a tray icon, a global hotkey and launch at sign-in (AFK). Then you install and run each one on the work laptop and report what happened: SmartScreen, Defender, AppLocker, or OK (HITL checklist).

## Progress

**AFK part done:**
- Probe sources are in `probes/` and CI is in `.github/workflows/probes.yml` (throwaway).
- The installers are built and downloadable from the Actions runs as artifacts:
  - `TauriProbe-Setup` (NSIS, currentUser): https://github.com/Hunter-Andrew/screenshot-annotation/actions/runs/43620377473
  - `DotnetProbe-Setup` (Inno Setup, PrivilegesRequired=lowest, self-contained .NET 8): https://github.com/Hunter-Andrew/screenshot-annotation/actions/runs/43621137987

Each probe, on launch:
- writes `Desktop\<Probe>-report.txt`;
- tries to register Print Screen and Ctrl+Shift+S;
- reads the Snipping Tool Print Screen setting;
- writes an HKCU Run entry;
- captures the screen, saves it to `Pictures\Screenshot Annotation`, and copies it to the clipboard;
- shows a tray icon (right-click it for Open report or Exit).

**HITL checklist:** done 2026-11-14 by Andrew on the work laptop.

## Answer

**Both stacks install and run per-user on the work laptop without admin.** Neither is ruled out by policy.

| Check | Tauri (NSIS currentUser) | .NET 8 (Inno, lowest privileges) |
| --- | --- | --- |
| Install location | `%LOCALAPPDATA%\TauriProbe` | `%LOCALAPPDATA%\Programs\DotnetProbe` |
| SmartScreen | Blue screen, "Run anyway" allowed | Same |
| Defender / AppLocker | No block | No block |
| Launch at sign-in (HKCU Run) | OK | OK |
| Screen capture | OK (3 monitors detected; captured the first, 1920x1080) | OK (whole virtual screen 3840x2160, origin Y=-1080) |
| Save to `Pictures\Screenshot Annotation` | OK | OK |
| Clipboard image → Teams/Outlook | OK | Report OK |
| Ctrl+Shift+S hotkey | Registered and received | "FAILED err 0": the Tauri probe was still running and held it; not a .NET limitation |
| Print Screen hotkey | Registration "OK" but never received; Snipping Tool opened | Same |

**Facts for later tickets:**
- **Work laptop:** Windows 11 build 26200, x64, with 3 monitors (one sits above another, so the virtual screen has negative coordinates).
- **Print Screen:** `PrintScreenKeyForSnippingEnabled` is not set, meaning Windows' default of sending Print Screen to Snipping Tool is in effect. `RegisterHotKey` reports success but never receives the key. The same happens on the personal PC. Andrew deferred fixing this (see the Print Screen ticket).
- **Code signing:** an unsigned build is usable (SmartScreen can be bypassed), so signing is a nice-to-have.
