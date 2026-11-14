# 01: Installable tray app with About

**What to build:** Andrew installs a per-user build and gets a tray icon. Right-clicking it shows Settings and Exit. Settings opens a small window whose About section shows the version and a Check for updates button that opens the GitHub Releases page. Launching the app a second time focuses the running one. Under the hood this sets up the Tauri 2 + React + TypeScript + Fabric.js app, the Platform bridge interface with an in-memory fake, the unit and Playwright end-to-end test harnesses, and Windows CI that runs the tests and builds the NSIS currentUser installer on every push.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] CI on windows-latest runs unit + e2e tests and uploads the per-user installer on every push
- [x] Installer installs with no admin (ADR 0001)
- [x] Tray icon with Settings and Exit; Exit quits
- [x] Settings → About shows the version; Check for updates opens the Releases page in the browser; no other network calls (ADR 0006)
- [x] Second launch focuses the existing instance
- [x] Platform bridge interface exists with a fake used by an e2e test that opens Settings

Spec: `.scratch/snagit-clone/spec.md`.
