# 17: The folder is the source of truth

**What to build:** Files deleted in Explorer disappear from the Library, and plain PNGs dropped into the folder appear as Annotated Images with no Annotations. A file written by a newer format version opens read-only with a notice.

**Blocked by:** 14 (Library Strip)

**Status:** ready-for-agent

- [ ] Folder watch via the bridge
- [ ] Unit: a newer format version decodes as read-only
- [ ] E2E with the fake bridge raising add/remove events

Spec: `.scratch/snagit-clone/spec.md`.
