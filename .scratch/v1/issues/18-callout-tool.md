# 18: Callout tool

**What to build:** Andrew adds boxed text with a pointer tail. The tail can be dragged to point anywhere and switched off (it is on by default). The text is edited in place, and the callout uses the Font, Text outline, Stroke and Fill groups.

**Blocked by:** 11 (Text tool)

**Status:** ready-for-agent

- [ ] A Textbox is the selectable object, with the box and tail kept in sync and a draggable tail handle (prototype finding)
- [ ] O shortcut
- [ ] Round-trips through the model

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Draw gesture (changed again after the M4 polish discussion; replaces the earlier "release is the corner nearest the tip" rule). Tail OFF: unchanged, press and release are opposite corners of the text area, a click makes a default-width (240) box. Tail ON and the pointer moved 4 px or more: the press P is the tip of the tail and the release R is the FAR corner of the speech box (the visible box: the text box plus its 10 px padding). The tail takes `calloutTailPercent`% (Settings, default 20, range 5 to 50) of the press-to-release distance, measured along the axis of the side that faces the tip (the axis the drag runs along most; a tie is horizontal); the speech box takes the rest: it spans from R back to that fraction of the way from P, and over the whole drag on the other axis. So P and R are at opposite ends of the whole callout. The text box is the speech box inset by the padding; a box too narrow for text (under 20 px wide) gets the default width (240) and slides to stay inside the visible area; R is clamped inside the visible area; the minimum height is the speech box's height less the padding (none when that is under 4 px). The stored `tip` is P relative to the text box's top-left (so it is often negative). A plain click with the tail on is as before: default box at the click, no `tip`, default tip below. Implemented in `calloutKind.fromDrag` (`boxFromTailDrag` in `src/core/annotations/callout.ts`; the percentage reaches it as `options.tailPercent`, which the canvas takes from the Settings through `setCalloutTailPercent`; unit tests in `callout.test.ts`).
- The tail never moves when the box is resized (M4 polish): every one of the eight handles re-aims the stored `tip` (relative to the text box's top-left) so that the tip stays at the same absolute spot on the picture; a callout that still had the default tip freezes it on its first resize. Moving the whole callout moves everything together. A resize that puts the tip inside the box simply draws no tail. `CalloutShape.dragHandle`; E2E in `e2e/calloutResize.spec.ts`.
- Live preview: while dragging with the tail on, the canvas shows the real Callout shape (speech box and tail) from the same `fromDrag` (given the visible area and the tail percentage, like the final one, so the two match), not the dashed Text rectangle (`fabricCanvas.ts`); with the tail off the dashed area stays. E2E in `e2e/callout.spec.ts` ("dragging a callout with the tail on").

