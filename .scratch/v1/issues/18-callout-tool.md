# 18: Callout tool

**What to build:** Andrew adds boxed text with a pointer tail. The tail can be dragged to point anywhere and switched off (it is on by default). The text is edited in place, and the callout uses the Font, Text outline, Stroke and Fill groups.

**Blocked by:** 11 (Text tool)

**Status:** ready-for-agent

- [ ] A Textbox is the selectable object, with the box and tail kept in sync and a draggable tail handle (prototype finding)
- [ ] O shortcut
- [ ] Round-trips through the model

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Draw gesture (changed after Andrew's review). Tail OFF: unchanged, press and release are opposite corners of the text area, a click makes a default-width (240) box. Tail ON and the pointer moved 4 px or more: the press P is the tip of the tail and the release R is the corner of the text box nearest the tip. The box extends away from P: to the right of R if R is right of P, otherwise to the left; downward if R is below P, otherwise upward. Its width is the dragged horizontal distance |R.x - P.x| (default 240 if that is under 20 px); its minimum height is the dragged vertical distance |R.y - P.y| (none if the drag is too thin, then one line). The box is kept inside the Capture (it slides), and the stored `tip` is P relative to the box's top-left (so it is often negative). A plain click with the tail on is as before: default box at the click, no `tip`, default tip below. Implemented in `calloutKind.fromDrag` (`src/core/annotations/callout.ts`, reusing `textAreaFromDrag`; unit tests in `callout.test.ts`).
- Live preview: while dragging with the tail on, the canvas shows the real Callout shape (speech box and tail) from the same `fromDrag`, not the dashed Text rectangle (`fabricCanvas.ts`); with the tail off the dashed area stays. E2E in `e2e/callout.spec.ts` ("dragging a callout with the tail on").

