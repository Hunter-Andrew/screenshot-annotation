// @vitest-environment node
import { describe, expect, it } from "vitest";
import { arrowBounds, arrowGeometry, arrowKind } from "./arrow";

describe("Arrow kind", () => {
  it("makes a straight arrow with one head from a drag, in the tool's style", () => {
    const arrow = arrowKind.fromDrag("a1", { x: 10, y: 20 }, { x: 110, y: 20 }, arrowKind.defaultStyle);

    expect(arrow).toEqual({
      id: "a1",
      type: "arrow",
      x1: 10,
      y1: 20,
      x2: 110,
      y2: 20,
      stroke: { color: "#e02424", width: 4 },
      arrowheads: { ends: "end" },
    });
  });

  it("keeps the style it is given", () => {
    const arrow = arrowKind.fromDrag(
      "a1",
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { stroke: { color: "#2563eb", width: 8 }, arrowheads: { ends: "both" } },
    );

    expect(arrow?.stroke).toEqual({ color: "#2563eb", width: 8 });
    expect(arrow?.arrowheads).toEqual({ ends: "both" });
  });

  it("drops a drag that is just a click (shorter than 4 px)", () => {
    expect(arrowKind.fromDrag("a1", { x: 5, y: 5 }, { x: 7, y: 6 }, arrowKind.defaultStyle)).toBeNull();
  });

  it("opts into the Stroke and Arrowheads groups, and the A shortcut", () => {
    expect(arrowKind.groups).toEqual(["stroke", "arrowheads"]);
    expect(arrowKind.label).toBe("Arrow");
    expect(arrowKind.shortcutAction).toBe("tool.arrow");
  });
});

describe("arrow geometry", () => {
  const arrow = (x2: number, ends: "end" | "both", width = 4) => ({
    id: "a",
    type: "arrow" as const,
    x1: 0,
    y1: 0,
    x2,
    y2: 0,
    stroke: { color: "#000", width },
    arrowheads: { ends },
  });

  it("puts one head with its tip on the end point; the line stops where the head starts", () => {
    // Stroke 4: the head is 22 long and 17.6 wide (worked out by hand from 10 + 3 * width).
    const geometry = arrowGeometry(arrow(100, "end"));

    expect(geometry.line).toEqual({ x1: 0, y1: 0, x2: 78, y2: 0 });
    expect(geometry.heads).toHaveLength(1);
    const [tip, left, right] = geometry.heads[0]!;
    expect(tip).toEqual({ x: 100, y: 0 });
    expect(left!.x).toBeCloseTo(78);
    expect(right!.x).toBeCloseTo(78);
    expect(Math.abs(left!.y)).toBeCloseTo(8.8);
    expect(left!.y).toBeCloseTo(-right!.y);
  });

  it("puts a head on both ends when asked", () => {
    const geometry = arrowGeometry(arrow(100, "both"));

    expect(geometry.heads.map((h) => h[0])).toEqual([
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(geometry.line).toEqual({ x1: 22, y1: 0, x2: 78, y2: 0 });
  });

  it("shrinks the heads on a short arrow instead of overshooting", () => {
    const geometry = arrowGeometry(arrow(10, "both"));

    // Two heads share the 10 px: 5 px each, so the line has no length left.
    expect(geometry.line.x1).toBeCloseTo(5);
    expect(geometry.line.x2).toBeCloseTo(5);
    expect(geometry.heads[0]![1]!.x).toBeCloseTo(5);
  });

  it("bounds contain the whole drawing, stroke included", () => {
    const a = { ...arrow(100, "end"), y2: 40 };
    const bounds = arrowBounds(a);

    expect(bounds.left).toBeLessThanOrEqual(-2);
    expect(bounds.top).toBeLessThanOrEqual(-2);
    expect(bounds.left + bounds.width).toBeGreaterThanOrEqual(102);
    expect(bounds.top + bounds.height).toBeGreaterThanOrEqual(42);
    for (const head of arrowGeometry(a).heads) {
      for (const p of head) {
        expect(p.x).toBeGreaterThanOrEqual(bounds.left);
        expect(p.x).toBeLessThanOrEqual(bounds.left + bounds.width);
        expect(p.y).toBeGreaterThanOrEqual(bounds.top);
        expect(p.y).toBeLessThanOrEqual(bounds.top + bounds.height);
      }
    }
  });
});
