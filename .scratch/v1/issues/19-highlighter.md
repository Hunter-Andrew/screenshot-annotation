# 19: Highlighter

**What to build:** Andrew draws see-through yellow freehand strokes, holding Shift for a straight horizontal stroke. The Highlighter is see-through and has an opacity setting.

**Blocked by:** 12 (Pen tool with smoothing)

**Status:** ready-for-agent

- [ ] H shortcut
- [ ] Shift snaps to horizontal

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- M4: the default colour is `#ffff00` (the palette's yellow and the other tools' default yellow too; styles already saved keep their old values). The Opacity group is four preset buttons, 25, 40, 60 and 80 %, instead of a slider; the default is 80 % (the preset nearest the old 100 % default). A stored stroke keeps whatever opacity it has (no migration) and shows no preset as pressed when it is not one of the four. The group is shared with pasted images, which therefore use the presets too. The cursor is an outline circle in the stroke colour, as wide as the stroke in Capture pixels (so the zoom scales it), drawn like the Pen eraser's ring instead of a crosshair (`fabricCanvas.ts`).
