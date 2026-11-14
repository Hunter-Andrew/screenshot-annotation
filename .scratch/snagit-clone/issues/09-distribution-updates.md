# Grilling: Distribution and updates

Type: grilling
Status: resolved
Blocked by: 03

## Question

How does a new version reach the work laptop? Options: GitHub Releases plus manual download, or an auto-updater; signed or unsigned; release cadence. Write the distribution ADR.

## Answer

Decided with Andrew on 2026-11-14. See ADR 0006.

**Releases**
- **Where:** GitHub Releases on this **public** repo (kept public so the work laptop downloads without signing in). Each Release carries the per-user NSIS setup `.exe`.
- **How:** pushing a version tag `vMAJOR.MINOR.PATCH` makes GitHub Actions build and publish the Release. Ordinary pushes only build and test.

**Updates are manual.**
- Andrew downloads the new setup `.exe` and runs it over the existing install.
- There is no auto-updater and no update-signing key.
- The app makes **no network calls at all**. The tray menu has "Check for updates", which only opens the Releases page in the browser. About shows the installed version.

**Unsigned.** The first install of each downloaded setup shows a SmartScreen "Run anyway" screen, which is accepted. The upgrade path, if ever needed, is Azure Trusted Signing.

**Installer behavior**
- **Upgrade:** auto-closes the running tray app, installs over it, keeps settings, sticky tool defaults, undo history and the thumbnail cache, then relaunches.
- **Uninstall:** never touches the Library in `Pictures\Screenshot Annotation`. App data (settings, history, cache) is removed only if "Also delete app data" is ticked.
