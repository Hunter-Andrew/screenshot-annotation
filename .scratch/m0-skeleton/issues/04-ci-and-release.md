# CI build and tag-triggered Release; remove probes

Status: ready-for-agent
Blocked by: 01

Replace `.github/workflows/probes.yml` with a `ci.yml` workflow:
- **Every push:** on `windows-latest`, run `npm ci`, the tests and `tauri build`, then upload the installer artifact.
- **On a `v*` tag:** additionally create a GitHub Release with the setup `.exe` attached.

Delete `probes/`, and remove the README note about probes.

**Done when:** a push builds green, and a test tag produces a Release with the installer (delete the test release afterwards).
