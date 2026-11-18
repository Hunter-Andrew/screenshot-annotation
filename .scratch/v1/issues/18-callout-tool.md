# 18: Callout tool

**What to build:** Andrew adds boxed text with a pointer tail. The tail can be dragged to point anywhere and switched off (it is on by default). The text is edited in place, and the callout uses the Font, Text outline, Stroke and Fill groups.

**Blocked by:** 11 (Text tool)

**Status:** ready-for-agent

- [ ] A Textbox is the selectable object, with the box and tail kept in sync and a draggable tail handle (prototype finding)
- [ ] O shortcut
- [ ] Round-trips through the model

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Draw gesture (redesigned in M4; replaces the earlier "tail takes a percentage of the drag" rule and the `calloutTailPercent` Settings field, which is removed everywhere). Tail OFF: unchanged, press and release are opposite corners of the text area, a click makes a default-width (240) box. Tail ON and the pointer moved 4 px or more: the drag only places the TAIL. The press P is the tip and the release R is where the tail ends; the speech box (the text box plus its 10 px padding) starts at R, in its corner nearest the tip, and extends away from the tip in the direction the drag ran (right and down for a drag that went right and down, and so on), so the tail runs along the drag line, diagonally. Default size: text box 240 wide with a lowest height of 40 (`DEFAULT_CALLOUT_MIN_HEIGHT`), so 260 x 60 with the padding; it grows with the text as before (past the lowest height; the handles can reshape it). R is clamped inside the visible area and the box slides to stay inside it too (a box slid over the tip simply draws no tail). The stored `tip` is P relative to the text box's top-left (so it is often negative). A plain click with the tail on is as before: default box at the click, no `tip`, default tip below. Implemented in `calloutKind.fromDrag` (`boxFromTailDrag` in `src/core/annotations/callout.ts`; unit tests in `callout.test.ts`; E2E in `e2e/callout.spec.ts`).
- The tail never moves when the box is resized (M4 polish): every one of the eight handles re-aims the stored `tip` (relative to the text box's top-left) so that the tip stays at the same absolute spot on the picture; a callout that still had the default tip freezes it on its first resize. Moving the whole callout moves everything together. A resize that puts the tip inside the box simply draws no tail. `CalloutShape.dragHandle`; E2E in `e2e/calloutResize.spec.ts`.
- Live preview: while dragging with the tail on, the canvas shows the real Callout shape (speech box and tail) from the same `fromDrag` (given the visible area, like the final one, so the two match), not the dashed Text rectangle (`fabricCanvas.ts`); with the tail off the dashed area stays. E2E in `e2e/callout.spec.ts` ("dragging a callout with the tail on").

