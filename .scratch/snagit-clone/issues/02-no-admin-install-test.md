# Task: Prove a per-user install works on the work laptop

Type: task
Status: claimed
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

**HITL checklist (work laptop):** pending; see the chat message.
