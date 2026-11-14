# 23: Tray and Settings completion

**What to build:** The tray menu has Capture, Capture in 3s / 5s / 10s, Open editor, Settings and Exit, and left-clicking the tray icon opens the editor. Closing the editor hides it to the tray, with a one-time notice. Settings gains Launch at sign-in (default on, using HKCU Run), the read-only Library folder with Open in Explorer, and Reset tool styles. The editor's ⚙ opens Settings.

**Blocked by:** 08 (Hotkey settings and the Print Screen notice), 10 (Line, Rectangle and Ellipse with the Style panel)

**Status:** ready-for-agent

- [ ] All items work
- [ ] Launch at sign-in survives sign-out/in (manual checklist)
- [ ] Reset clears the sticky styles

Spec: `.scratch/snagit-clone/spec.md`.
