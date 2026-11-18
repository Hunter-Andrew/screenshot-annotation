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

## M4 additions (2026-11-18)

- **Canvas margin** now 0 to 200 px, default 16 (was 16 to 200, default 48). The value is only written to `settings.json` once Settings saves something, and a stored 48 cannot be told from a chosen 48, so a stored value is never migrated.
- **Canvas margin during crop** (`cropMargin`): 0 to 400 px, default 150. While the Crop tool is on, the editor uses it instead of the Canvas margin and a view in Fit re-fits to it with a short glide; leaving the tool glides back. A zoom the user chose by hand is left alone.
- **Dark image background** (`darkBackground`): a colour picker beside Image background, `#RRGGBB`, default `#191919`, validated in Rust and TypeScript. Applied when drawing (editor and Export), never stored with an image, so it also changes reopened images. Separate from Outside-canvas darkness.
- **Library Strip collapsed** (`libraryStripCollapsed`, boolean): not shown in Settings; the chevron on the strip sets it. Carried by the same image-settings event as the others.
