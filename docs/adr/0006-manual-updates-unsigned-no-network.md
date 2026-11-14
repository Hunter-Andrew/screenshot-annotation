---
status: accepted
---

# Manual updates from public GitHub Releases; unsigned; no network calls

New versions are published as GitHub Releases on this public repo when a `vX.Y.Z` tag is pushed. Andrew updates by downloading the per-user setup `.exe` and running it over the existing install, which keeps all settings, history and the Library. The app deliberately has no auto-updater and makes no network calls at all ("Check for updates" just opens the Releases page in the browser). That keeps it simple and quiet on a work laptop. Installers are not code-signed, so SmartScreen shows "Run anyway" on each downloaded setup. That was tested and accepted on the work laptop; Azure Trusted Signing is the upgrade path if IT ever blocks unsigned apps.

## Considered Options

- **Tauri updater with an update-signing key:** rejected; Andrew prefers manual updates.
- **Private repo:** rejected; downloads would need a GitHub sign-in on the work laptop.
