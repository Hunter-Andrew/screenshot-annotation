# Scaffold the Tauri 2 + React + TypeScript app

Status: ready-for-agent
Blocked by: 

Create the app in `app/`:
- **Stack:** Tauri 2, React, TypeScript and Vite, with `fabric@6` as a dependency (unused yet).
- **Tests:** Vitest set up, with one trivial passing test.
- **Tooling:** ESLint and Prettier.
- **Tauri config:**
  - `productName` "Screenshot Annotation";
  - identifier `dev.screenshotannotation.app`;
  - bundle target NSIS with `installMode: currentUser` (ADR 0001).

Update README → Development with the setup commands (Rust, Node).

**Done when:** `npm test` passes and `npm run tauri build` produces a per-user NSIS installer on Windows.
