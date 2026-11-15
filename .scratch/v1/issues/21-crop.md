# 21: Crop

**What to build:** Crop sets the visible area of the Annotated Image without altering the Capture. It can be widened again later and is applied to Exports and the Library's visible pixels.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** ready-for-agent

- [ ] C shortcut
- [ ] Unit: Crop round-trips; widening restores the original area

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15: design this together with ticket 37 (canvas expansion, "crop in reverse"): both are one concept, the visible area of the Annotated Image, which can be smaller than the Capture (Crop) or larger (expansion, with a background fill). Build one model field and one renderer path, not two.
