import { describe, expect, it } from "vitest";
import { bubbleBox, CALLOUT_PAD, defaultTip, outlinePath, outlinePoints, tailTo } from "./calloutGeometry";

const box = { left: 100, top: 100, width: 200, height: 80 };

describe("callout geometry", () => {
  it("grows the text box by the padding on every side", () => {
    expect(bubbleBox({ left: 50, top: 50, width: 100, height: 40 })).toEqual({
      left: 50 - CALLOUT_PAD,
      top: 50 - CALLOUT_PAD,
      width: 100 + 2 * CALLOUT_PAD,
      height: 40 + 2 * CALLOUT_PAD,
    });
  });

  it("has no tail for a tip inside the box", () => {
    expect(tailTo(box, { x: 150, y: 140 })).toBeNull();
  });

  it("leaves from the side the tip lies beyond", () => {
    expect(tailTo(box, { x: 200, y: 260 })!.side).toBe("bottom");
    expect(tailTo(box, { x: 200, y: 10 })!.side).toBe("top");
    expect(tailTo(box, { x: 500, y: 140 })!.side).toBe("right");
    expect(tailTo(box, { x: 10, y: 140 })!.side).toBe("left");
    // A tip past a corner picks the larger overshoot.
    expect(tailTo(box, { x: 320, y: 400 })!.side).toBe("bottom");
  });

  it("puts the base on the box edge, centred on the tip, and clear of the corners", () => {
    const t = tailTo(box, { x: 200, y: 260 })!;
    expect(t.base.every((p) => p.y === 180)).toBe(true);
    expect((t.base[0].x + t.base[1].x) / 2).toBe(200);
    const nearCorner = tailTo(box, { x: 101, y: 260 })!;
    expect(Math.min(...nearCorner.base.map((p) => p.x))).toBeGreaterThanOrEqual(100 + 8);
  });

  it("is a closed walk around the box with the tail on its own side only", () => {
    const t = tailTo(box, { x: 200, y: 260 })!;
    const pts = outlinePoints(box, t);
    expect(pts).toHaveLength(7); // four corners + base, tip, base
    expect(pts).toContainEqual({ x: 200, y: 260 });
    expect(outlinePoints(box, null)).toHaveLength(4);
    const path = outlinePath(box, t);
    expect(path[0]!.op).toBe("M");
    expect(path.filter((p) => p.op === "A")).toHaveLength(4);
  });

  it("proposes a default tip below the box", () => {
    const tip = defaultTip({ width: 200, height: 40 });
    expect(tip.y).toBeGreaterThan(40);
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x).toBeLessThan(200);
  });
});
