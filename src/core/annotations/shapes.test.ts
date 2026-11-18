// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ANNOTATION_KINDS, kindOf } from ".";
import { ellipseKind } from "./ellipse";
import { lineBounds, lineKind } from "./line";
import { rectKind } from "./rect";

describe("Line kind", () => {
  it("makes a line from a drag, in the tool's style", () => {
    expect(lineKind.fromDrag("l1", { x: 10, y: 20 }, { x: 110, y: 60 }, lineKind.defaultStyle)).toEqual({
      id: "l1",
      type: "line",
      x1: 10,
      y1: 20,
      x2: 110,
      y2: 60,
      stroke: { color: "#e02424", width: 4 },
    });
  });

  it("drops a click, and opts into Stroke only, on the L key", () => {
    expect(lineKind.fromDrag("l", { x: 5, y: 5 }, { x: 6, y: 6 }, lineKind.defaultStyle)).toBeNull();
    expect(lineKind.groups).toEqual(["stroke"]);
    expect([lineKind.label, lineKind.shortcutAction]).toEqual(["Line", "tool.line"]);
  });

  it("bounds contain the line with its thickness", () => {
    const b = lineBounds({ id: "l", type: "line", x1: 10, y1: 10, x2: 50, y2: 30, stroke: { color: "#000000", width: 10 } });
    expect(b.left).toBeLessThanOrEqual(5);
    expect(b.top).toBeLessThanOrEqual(5);
    expect(b.left + b.width).toBeGreaterThanOrEqual(55);
    expect(b.top + b.height).toBeGreaterThanOrEqual(35);
  });
});

describe.each([
  ["Rectangle", rectKind, "rect", "tool.rect"],
  ["Ellipse", ellipseKind, "ellipse", "tool.ellipse"],
] as const)("%s kind", (label, kind, type, action) => {
  it("takes its box from a drag in any direction, in the tool's style (no fill by default)", () => {
    expect(kind.fromDrag("s1", { x: 110, y: 80 }, { x: 10, y: 20 }, kind.defaultStyle)).toEqual({
      id: "s1",
      type,
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      stroke: { color: "#e02424", width: 4 },
      fill: { mode: "none", color: "#ffff00", opacity: 0.4 },
    });
  });

  it("keeps the style it is given", () => {
    const shape = kind.fromDrag(
      "s1",
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { stroke: { color: "#2563eb", width: 8 }, fill: { mode: "semi", color: "#16a34a", opacity: 0.3 } },
    );
    expect(shape?.stroke).toEqual({ color: "#2563eb", width: 8 });
    expect(shape?.fill).toEqual({ mode: "semi", color: "#16a34a", opacity: 0.3 });
  });

  it("drops a click but keeps a thin box", () => {
    expect(kind.fromDrag("s", { x: 5, y: 5 }, { x: 7, y: 6 }, kind.defaultStyle)).toBeNull();
    expect(kind.fromDrag("s", { x: 5, y: 5 }, { x: 205, y: 6 }, kind.defaultStyle)).not.toBeNull();
  });

  it("opts into Stroke and Fill, and its key", () => {
    expect(kind.groups).toEqual(["stroke", "fill"]);
    expect([kind.label, kind.shortcutAction]).toEqual([label, action]);
  });
});

describe("the registry", () => {
  it("lists Arrow, Line, Rectangle and Ellipse as tools, findable by type", () => {
    const types = ANNOTATION_KINDS.map((k) => k.type);
    expect(types).toEqual(expect.arrayContaining(["arrow", "line", "rect", "ellipse"]));
    expect(kindOf("rect")).toBe(rectKind);
  });
});
