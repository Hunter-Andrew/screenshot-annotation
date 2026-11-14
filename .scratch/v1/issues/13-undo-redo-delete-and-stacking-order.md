# 13: Undo/redo, delete and stacking order

**What to build:** Every editor change can be undone and redone, including after switching images or restarting. History is stored per image in local app data (never in the PNG), capped at 200 steps, discarded if the PNG's content hash changed outside the app, and deleted after 60 days without opening or editing. Delete removes the selected Annotation, and bring forward / send back reorder Annotations.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** ready-for-agent

- [ ] Unit tests for the cap, the hash discard and expiry
- [ ] E2E: undo/redo survives a reload
- [ ] Delete and reorder work

Spec: `.scratch/snagit-clone/spec.md`.
