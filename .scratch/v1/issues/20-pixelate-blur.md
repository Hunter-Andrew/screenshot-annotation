# 20: Pixelate Blur

**What to build:** Andrew drags a region to pixelate it, with a strength setting. The Blur stays movable and deletable in the editor; the Capture keeps the original pixels (ADR 0002). Exports and Library visible pixels are pixelated.

**Blocked by:** 10 (Line, Rectangle and Ellipse with the Style panel)

**Status:** ready-for-agent

- [ ] Pixelate only
- [ ] Unit: an Export of an image with a Blur contains no unblurred pixels and no embedded chunk
- [ ] Manual checklist: the pasted image is pixelated
- [ ] B shortcut

Spec: `.scratch/snagit-clone/spec.md`.
