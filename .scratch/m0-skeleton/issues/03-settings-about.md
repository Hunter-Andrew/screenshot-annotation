# Settings window with About

Status: ready-for-agent
Blocked by: 01

A small separate Settings window, opened from the tray menu. For M0 it only has an About section:
- the app version, read from Tauri;
- a "Check for updates" button that opens https://github.com/Hunter-Andrew/screenshot-annotation/releases in the default browser.

The app makes no other network calls (ADR 0006). Keep the layout ready for M1's hotkey section.

**Done when:** the Settings window opens from the tray and the button opens the Releases page.
