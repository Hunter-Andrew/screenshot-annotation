// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFromCapture } from "../annotatedImage";
import { applyEdit, type Edit } from "../editSession";
import { invert } from "../history";
import { encodeRgbaPng } from "../png";
import type { Annotation, AnnotationModel } from "../annotation";
import { followAreaEdit, visibleAreaOf } from "../area";
import { eraseEdit, erasePieces, MIN_PIECE } from "./erase";
import type { PenAnnotation } from "./pen";

const along = (...xs: number[]) => xs.map((x) => ({ x, y: 0 }));
const R = 10; // the eraser's radius in these tests

describe("erasePieces: what is left of a stroke after the eraser passed", () => {
  it("is null when the eraser never came within its radius of the stroke", () => {
    expect(erasePieces(along(0, 50, 100), [{ x: 50, y: 25 }], R)).toBeNull();
  });

  it("splits a stroke in two where the eraser crosses its middle, cutting exactly at the circle's edge", () => {
    const pieces = erasePieces(along(0, 20, 40, 60, 80, 100), [{ x: 50, y: 0 }], R);

    expect(pieces).toEqual([along(0, 20, 40), along(60, 80, 100)]);
  });

  it("cuts a segment between two stored points too, not only the points", () => {
    // Only two stored points, 100 apart: nothing stored is near the eraser at (50, 6).
    const pieces = erasePieces(along(0, 100), [{ x: 50, y: 6 }], R);

    const half = Math.sqrt(R * R - 6 * 6); // 8: the circle covers x 42..58 on the line
    expect(pieces).toHaveLength(2);
    expect(pieces![0]!.at(-1)!.x).toBeCloseTo(50 - half, 9);
    expect(pieces![1]![0]!.x).toBeCloseTo(50 + half, 9);
  });

  it("shortens a stroke whose end is erased", () => {
    expect(erasePieces(along(0, 20, 40, 60), [{ x: 0, y: 0 }], R)).toEqual([along(10, 20, 40, 60)]);
    expect(erasePieces(along(0, 20, 40, 60), [{ x: 60, y: 0 }], R)).toEqual([along(0, 20, 40, 50)]);
  });

  it("leaves nothing when the eraser covers the whole stroke", () => {
    expect(erasePieces(along(0, 5, 10), [{ x: 5, y: 0 }], R)).toEqual([]);
  });

  it("counts a point exactly one radius away as erased", () => {
    expect(erasePieces([{ x: 30, y: 30 }, { x: 30, y: 30 }], [{ x: 40, y: 30 }], R)).toEqual([]);
  });

  it("cuts where the eraser passes BETWEEN two sampled pointer positions", () => {
    // The pointer jumped from (50, -30) to (50, 30): no sample is near the stroke, the sweep crosses it.
    const pieces = erasePieces(along(0, 100), [{ x: 50, y: -30 }, { x: 50, y: 30 }], R);

    expect(pieces).toEqual([along(0, 40), along(60, 100)]);
  });

  it("makes several cuts when the path crosses the stroke several times", () => {
    const path = [{ x: 20, y: 0 }, { x: 20, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 0 }];
    const pieces = erasePieces(along(0, 100), path, R)!;

    expect(pieces).toEqual([along(0, 10), along(30, 50), along(70, 100)]);
  });

  it("follows a bend: the pieces keep the original corner points", () => {
    const stroke = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const pieces = erasePieces(stroke, [{ x: 30, y: 0 }], R)!;

    expect(pieces).toEqual([[{ x: 0, y: 0 }, { x: 20, y: 0 }], [{ x: 40, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]]);
  });

  it("drops a leftover shorter than the Pen's dot limit rather than keeping debris", () => {
    // 100 long, the eraser leaves 2 px at the start (x 0..2) and the rest after x 22.
    const pieces = erasePieces(along(0, 100), [{ x: 12, y: 0 }], R)!;

    expect(MIN_PIECE).toBe(4);
    expect(pieces).toEqual([along(22, 100)]);
  });

  it("deletes a dot (a click's two identical points) the eraser touches, and ignores one it misses", () => {
    const dot = [{ x: 30, y: 30 }, { x: 30, y: 30 }];

    expect(erasePieces(dot, [{ x: 35, y: 30 }], R)).toEqual([]);
    expect(erasePieces(dot, [{ x: 50, y: 30 }], R)).toBeNull();
  });
});

const pen = (id: string, points: { x: number; y: number }[], color = "#e02424"): PenAnnotation => ({
  id,
  type: "pen",
  points,
  stroke: { color, width: 6 },
});
const highlight = (id: string): Annotation => ({
  id,
  type: "highlight",
  points: along(0, 100),
  stroke: { color: "#facc15", width: 16 },
  opacity: { value: 0.4 },
});
const image = (annotations: Annotation[]) => ({
  ...createFromCapture(encodeRgbaPng(300, 200, new Uint8Array(300 * 200 * 4).fill(255))),
  model: { formatVersion: 1, annotations, crop: null } as AnnotationModel,
});
const ids = (function* () {
  let n = 0;
  while (true) yield `new${++n}`;
})();
const newId = () => ids.next().value as string;

describe("eraseEdit: the one edit an erase drag makes", () => {
  it("is null when nothing was touched", () => {
    const before = image([pen("a", along(0, 100))]);

    expect(eraseEdit(before, [{ x: 50, y: 50 }], R, "white", newId).edit).toBeNull();
  });

  it("splits a stroke into two Pen strokes that keep its style and its place in the stacking order", () => {
    const before = image([pen("a", along(0, 20, 40, 60, 80, 100), "#2563eb"), pen("top", along(0, 10), "#000000")]);

    const { edit } = eraseEdit(before, [{ x: 50, y: 0 }], R, "white", newId);
    const after = applyEdit(before, edit!);

    const list = after.model.annotations as PenAnnotation[];
    expect(list.map((a) => a.id)).toEqual(["a", expect.stringMatching(/^new/), "top"]);
    expect(list[0]!.points).toEqual(along(0, 20, 40));
    expect(list[1]!.points).toEqual(along(60, 80, 100));
    expect(list[1]!.stroke).toEqual({ color: "#2563eb", width: 6 });
    expect(list[2]!.points).toEqual(along(0, 10));
  });

  it("deletes a stroke with nothing left", () => {
    const before = image([pen("a", along(0, 5)), pen("b", [{ x: 0, y: 100 }, { x: 50, y: 100 }])]);

    const after = applyEdit(before, eraseEdit(before, [{ x: 2, y: 0 }], R, "white", newId).edit!);

    expect(after.model.annotations.map((a) => a.id)).toEqual(["b"]);
  });

  it("cuts several strokes in one edit, and is one batch", () => {
    const before = image([pen("a", along(0, 100)), pen("b", [{ x: 50, y: -50 }, { x: 50, y: 50 }])]);

    const { edit } = eraseEdit(before, [{ x: 50, y: 0 }], R, "white", newId);

    expect(edit!.kind).toBe("batch");
    expect(applyEdit(before, edit!).model.annotations).toHaveLength(4);
  });

  it("never touches a Highlighter stroke, whatever its order", () => {
    const before = image([highlight("h"), pen("a", along(0, 100)), highlight("h2")]);

    const after = applyEdit(before, eraseEdit(before, [{ x: 50, y: 0 }], R, "white", newId).edit!);

    const kept = after.model.annotations.filter((a) => a.type === "highlight");
    expect(kept).toEqual([highlight("h"), highlight("h2")]);
    expect(after.model.annotations.filter((a) => a.type === "pen")).toHaveLength(2);
  });

  it("is undone whole by the inverse the history computes, and redone by the edit itself", () => {
    const before = image([pen("a", along(0, 100)), pen("b", [{ x: 50, y: -50 }, { x: 50, y: 50 }])]);
    const { edit } = eraseEdit(before, [{ x: 50, y: 0 }], R, "white", newId);

    const after = applyEdit(before, edit!);
    const undone = applyEdit(after, invert(before, edit!) as Edit);

    expect(undone.model.annotations).toEqual(before.model.annotations);
    expect(applyEdit(undone, edit!).model.annotations).toEqual(after.model.annotations);
  });

  it("never touches the visible area: a Pen stroke past the edge does not grow it, so erasing it has nothing to shrink", () => {
    const blank = image([]);
    const stroke = pen("far", along(100, 200, 280, 350));
    const bounds = { x: 97, y: -3, width: 256, height: 6 };
    const grown = applyEdit(blank, followAreaEdit(blank, { kind: "add", annotation: stroke }, bounds, "white").edit);
    expect(visibleAreaOf(grown).width).toBe(300);

    const { edit } = eraseEdit(grown, [{ x: 350, y: 0 }, { x: 290, y: 0 }], R, "white", newId);
    const after = applyEdit(grown, edit!);

    expect(visibleAreaOf(after).width).toBe(300);
    expect(after.model.crop ?? null).toBeNull();
    expect(applyEdit(after, invert(grown, edit!) as Edit)).toEqual(grown);
  });
});
