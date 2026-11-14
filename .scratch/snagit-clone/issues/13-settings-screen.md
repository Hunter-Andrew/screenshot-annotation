# Grilling: Settings screen

Type: grilling
Status: resolved
Blocked by: 

## Question

What appears in Settings and where does it live? Known items include the capture hotkey (rebindable, with a conflict warning), launch at sign-in, the Print Screen notice, the version / Check for updates link, and the Library folder location (fixed or changeable?). Decide whether Settings is a window or a panel, and which tray menu items exist (Capture, Capture in 3/5/10 s, Open editor, Settings, Exit).

## Answer

Decided with Andrew on 2026-11-14.

**Settings window.** A small separate window, opened from the tray menu and a ⚙ button in the editor's top bar. It contains:
1. **Capture hotkey:** click to record a combination, with a conflict warning. It also shows the Print Screen / Snipping Tool notice with its [Open Windows setting] button (see [Claiming Print Screen from Snipping Tool](10-print-screen-hotkey.md)).
2. **Launch at sign-in:** on/off, default on.
3. **Library folder:** shown read-only as `Pictures\Screenshot Annotation`, with an "Open in Explorer" button. Not changeable in v1.
4. **Reset tool styles to defaults:** a button that clears the sticky styles.
5. **About:** version number and "Check for updates" (opens GitHub Releases).

**Tray icon**
- **Left-click:** opens the editor.
- **Right-click menu:** Capture · Capture in 3s / 5s / 10s · Open editor · Settings · Exit.

**Closing the editor** (✕) hides it to the tray; the app keeps running and the hotkey still works. Only tray → Exit quits. The first close shows a one-time "Still running in the tray" notice.
