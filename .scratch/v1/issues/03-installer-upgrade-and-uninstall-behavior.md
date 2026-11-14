# 03: Installer upgrade and uninstall behavior

**What to build:** Running a newer setup over an old install closes the running tray app, installs, keeps settings, tool styles, history and the thumbnail cache, and relaunches the app. Uninstalling never touches the Library and offers an "Also delete app data" option.

**Blocked by:** 02 (Tag-triggered Releases and release checklist)

**Status:** ready-for-agent

- [ ] Upgrade auto-closes the running app and relaunches it afterwards
- [ ] App data survives an upgrade
- [ ] Uninstall leaves Pictures\Screenshot Annotation untouched
- [ ] App data is removed only when "Also delete app data" is ticked
- [ ] Covered by the release checklist

Spec: `.scratch/snagit-clone/spec.md`.
