// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFromCapture } from "./annotatedImage";
import type { RectAnnotation } from "./annotation";
import { MAX_AREA_SIDE, visibleAreaOf } from "./area";
import { applyEdit, type Edit } from "./editSession";
import { followAreaEdits } from "./multiEdit";
import { encodeRgbaPng } from "./png";

// A multi-selection moved or deleted is one edit; the visible area follows each Annotation in turn.

const W = 100;
const H = 80;
const rect = (id: string, x: number, y = 10): RectAnnotation => ({
  id,
  type: "rect",
  x,
  y,
  width: 10,
  height: 10,
  stroke: { color: "#e02424", width: 4 },
  fill: { mode: "none", color: "#facc15", opacity: 0.4 },
});
const boundsOf = (a: RectAnnotation) => ({ x: a.x, y: a.y, width: a.width, height: a.height });
const imageWith = (...rects: RectAnnotation[]) =>
  rects.reduce((image, annotation) => applyEdit(image, { kind: "add", annotation } as Edit), createFromCapture(encodeRgbaPng(W, H, new Uint8Array(W * H * 4).fill(255))));
const xs = (image: ReturnType<typeof imageWith>) => image.model.annotations.map((a) => (a as RectAnnotation).x);

describe("followAreaEdits", () => {
  it("is nothing for no items", () => {
    expect(followAreaEdits(imageWith(), [], "dark")).toEqual({ edit: null, limited: false });
  });

  it("turns several updates into ONE batch edit", () => {
    const image = imageWith(rect("a", 0), rect("b", 40));
    const { edit } = followAreaEdits(
      image,
      [
        { edit: { kind: "update", id: "a", patch: { x: 5 } }, bounds: boundsOf(rect("a", 5)) },
        { edit: { kind: "update", id: "b", patch: { x: 45 } }, bounds: boundsOf(rect("b", 45)) },
      ],
      "dark",
    );
    expect(edit?.kind).toBe("batch");
    expect(xs(applyEdit(image, edit!))).toEqual([5, 45]);
  });

  it("grows the area for every Annotation moved past the edge, and shrinks it back when they are deleted", () => {
    const image = imageWith(rect("a", 0), rect("b", 40));
    const moved = followAreaEdits(
      image,
      [
        { edit: { kind: "update", id: "a", patch: { x: 120 } }, bounds: boundsOf(rect("a", 120)) },
        { edit: { kind: "update", id: "b", patch: { x: 150 } }, bounds: boundsOf(rect("b", 150)) },
      ],
      "dark",
    );
    const grown = applyEdit(image, moved.edit!);
    expect(visibleAreaOf(grown).width).toBeGreaterThanOrEqual(160); // the farthest one (150 + 10) is inside

    const gone = followAreaEdits(grown, [{ edit: { kind: "delete", id: "a" } }, { edit: { kind: "delete", id: "b" } }], "dark");
    expect(visibleAreaOf(applyEdit(grown, gone.edit!))).toEqual({ x: 0, y: 0, width: W, height: H });
  });

  it("reports the 8192 px limit", () => {
    const image = imageWith(rect("a", 0));
    const result = followAreaEdits(image, [{ edit: { kind: "update", id: "a", patch: { x: MAX_AREA_SIDE + 500 } }, bounds: boundsOf(rect("a", MAX_AREA_SIDE + 500)) }], "dark");
    expect(result.limited).toBe(true);
  });
});
