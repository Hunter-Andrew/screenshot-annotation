# 02: Tag-triggered Releases and release checklist

**What to build:** Pushing a vX.Y.Z tag publishes a GitHub Release with the setup .exe attached. The manual work-laptop checklist exists for Andrew to run before each release, and the throwaway install probes are gone.

**Blocked by:** 01 (Installable tray app with About)

**Status:** resolved

- [ ] A v* tag builds, tests and creates a Release with the installer; failing tests block it (unverified: workflow YAML parses and the release job has `needs: build-and-test`; the real run is only provable on GitHub with a tag, which was not pushed)
- [x] docs/release-checklist.md covers the Testing strategy items, each marked with the milestone it applies from, including perceived speed
- [x] probes/ and its workflow are deleted; README updated
- [x] README links the checklist

Spec: `.scratch/snagit-clone/spec.md`.
