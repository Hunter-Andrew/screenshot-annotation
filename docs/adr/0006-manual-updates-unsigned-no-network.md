---
status: accepted
---

# Manual updates from public GitHub Releases; unsigned; no network calls

New versions are published as GitHub Releases on this public repo when a `vX.Y.Z` tag is pushed. Andrew updates by downloading the per-user setup `.exe` and running it over the existing install, which keeps all settings, history and the Library. The app deliberately has no auto-updater and makes no network calls at all ("Check for updates" just opens the Releases page in the browser). That keeps it simple and quiet on a work laptop. Installers are not code-signed, so SmartScreen shows "Run anyway" on each downloaded setup. That was tested and accepted on the work laptop; Azure Trusted Signing is the upgrade path if IT ever blocks unsigned apps.

## Considered Options

- **Tauri updater with an update-signing key:** rejected; Andrew prefers manual updates.
- **Private repo:** rejected; downloads would need a GitHub sign-in on the work laptop.

## Update 2026-11-14: signing is now required for the work laptop

Windows Smart App Control (unlike SmartScreen) blocks an unsigned installer with no "Run anyway" option, so the unsigned assumption above no longer holds there. CI now signs the installer with Azure Trusted Signing whenever the signing secrets are configured (see `.github/workflows/ci.yml`) and fails the build if the result is not validly signed. Without the secrets the build is unsigned, as before. A new signing identity may still need to build reputation, so check the release on the laptop before relying on it.

## Update 2026-11-15 (later): unsigned releases are acceptable for now

The unsigned CI installer installs and runs on Andrew's work laptop without being blocked by Smart App Control (observed on the M2 builds), so releases may be published unsigned. CI therefore signs when all six signing values are configured and otherwise builds unsigned with a warning (the artifact is named plainly, `Screenshot-Annotation-Setup`); a partly configured setup is still an error. The earlier block was not reproduced on these builds, and Smart App Control behavior can differ per machine and over time, so signing stays the upgrade path if IT ever blocks the installer.
