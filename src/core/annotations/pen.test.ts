// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFromCapture, decodeLibraryPng, encodeLibraryPng } from "../annotatedImage";
import { applyEdit } from "../editSession";
import { encodeRgbaPng } from "../png";
import { decimate, penBounds, penKind, smoothPath, type PenAnnotation } from "./pen";

const line = (n: number, step = 1) => Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0 }));

describe("decimate", () => {
  it("drops points closer than the minimum distance to the last kept one, keeping first and last", () => {
    const out = decimate(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 4.5, y: 0 }],
      2.5,
    );

    // 0 kept; 1 and 2 too close; 3 kept; 4 too close; the last point always survives.
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 4.5, y: 0 }]);
  });

  it("leaves a sparse stroke alone", () => {
    expect(decimate(line(4, 10), 2)).toEqual(line(4, 10));
  });
});

describe("smoothPath", () => {
  it("draws a straight line for two points", () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toEqual([
      { op: "M", x: 0, y: 0 },
      { op: "L", x: 10, y: 5 },
    ]);
  });

  it("curves through the midpoints, using each inner point as a control point", () => {
    const path = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }]);

    expect(path).toEqual([
      { op: "M", x: 0, y: 0 },
      { op: "Q", cx: 10, cy: 0, x: 10, y: 5 },
      { op: "Q", cx: 10, cy: 10, x: 15, y: 10 },
      { op: "L", x: 20, y: 10 },
    ]);
  });

  it("is empty for no points", () => {
    expect(smoothPath([])).toEqual([]);
  });
});

describe("Pen kind", () => {
  const style = penKind.defaultStyle;

  it("opts into the Stroke group only, with the P shortcut action", () => {
    expect(penKind.type).toBe("pen");
    expect(penKind.label).toBe("Pen");
    expect(penKind.shortcutAction).toBe("tool.pen");
    expect(penKind.groups).toEqual(["stroke"]);
  });

  it("stores the decimated captured points and the style", () => {
    const raw = line(20, 1);
    const pen = penKind.fromPath!("p1", raw, style)!;

    expect(pen.type).toBe("pen");
    expect(pen.id).toBe("p1");
    expect(pen.stroke).toEqual(style.stroke);
    expect(pen.points.length).toBeLessThan(raw.length);
    expect(pen.points[0]).toEqual({ x: 0, y: 0 });
    expect(pen.points.at(-1)).toEqual({ x: 19, y: 0 });
  });

  it("drops a click or a tiny scribble (under 4 px of travel)", () => {
    expect(penKind.fromPath!("p", [{ x: 5, y: 5 }], style)).toBeNull();
    expect(penKind.fromPath!("p", [{ x: 5, y: 5 }, { x: 6, y: 6 }], style)).toBeNull();
  });

  it("makes a straight stroke from a plain drag too", () => {
    const pen = penKind.fromDrag("p", { x: 0, y: 0 }, { x: 30, y: 0 }, style);
    expect(pen?.points).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }]);
  });
});

describe("Pen strokes in the model", () => {
  const stroke = (): PenAnnotation => {
    const raw = Array.from({ length: 40 }, (_, i) => ({ x: i * 1.5, y: Math.sin(i / 4) * 10 + 20 }));
    return penKind.fromPath!("p1", raw, { stroke: { color: "#2563eb", width: 8 } })!;
  };
  const render = async () => encodeRgbaPng(1, 1, new Uint8Array([9, 9, 9, 255]));
  const withStroke = (pen: PenAnnotation) =>
    applyEdit(createFromCapture(encodeRgbaPng(1, 1, new Uint8Array([1, 2, 3, 255]))), {
      kind: "add",
      annotation: pen,
    });

  it("round-trips through a Library PNG with its points and style, and reopens editable", async () => {
    const pen = stroke();

    const decoded = decodeLibraryPng(await encodeLibraryPng(withStroke(pen), render));

    expect(decoded.model.annotations).toEqual([pen]);
    expect(decoded.readOnly).toBe(false);
  });

  it("restyles by replacing the Stroke group, leaving the points alone", () => {
    const pen = stroke();

    const edited = applyEdit(withStroke(pen), {
      kind: "update",
      id: "p1",
      patch: { stroke: { color: "#000000", width: 2 } },
    });

    expect(edited.model.annotations[0]).toEqual({ ...pen, stroke: { color: "#000000", width: 2 } });
  });
});

describe("penBounds", () => {
  it("covers every point and the stroke thickness", () => {
    const pen: PenAnnotation = {
      id: "p",
      type: "pen",
      points: [{ x: 10, y: 20 }, { x: 50, y: 60 }],
      stroke: { color: "#000", width: 8 },
    };
    const b = penBounds(pen);

    expect(b.left).toBeLessThanOrEqual(6);
    expect(b.top).toBeLessThanOrEqual(16);
    expect(b.left + b.width).toBeGreaterThanOrEqual(54);
    expect(b.top + b.height).toBeGreaterThanOrEqual(64);
  });
});
