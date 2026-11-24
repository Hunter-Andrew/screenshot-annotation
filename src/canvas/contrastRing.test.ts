import { describe, expect, it } from "vitest";
import { strokeContrastRing } from "./contrastRing";

/** A 2D context that only records what is drawn: the stroke style and line width in force at each `stroke()`. */
function recorder() {
  const strokes: { style: string; width: number }[] = [];
  const calls: unknown[][] = [];
  const ctx = {
    lineWidth: 0,
    strokeStyle: "",
    beginPath: () => {},
    arc: (...args: unknown[]) => calls.push(args),
    stroke() {
      strokes.push({ style: this.strokeStyle, width: this.lineWidth });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes, calls };
}

describe("strokeContrastRing", () => {
  it("draws one circle twice: a thick dark line, then a thinner white one on top, so it reads on any background", () => {
    const { ctx, strokes, calls } = recorder();
    strokeContrastRing(ctx, { x: 10, y: 20 }, 15, 1);
    expect(calls).toEqual([[10, 20, 15, 0, Math.PI * 2]]);
    expect(strokes).toHaveLength(2);
    expect(strokes[0]!.style).toMatch(/^rgba\(17, 24, 39/);
    expect(strokes[1]!.style).toBe("#ffffff");
    expect(strokes[0]!.width).toBeGreaterThan(strokes[1]!.width);
  });

  it("keeps the lines the same size on screen at any zoom (the pixel is a screen pixel in Capture pixels)", () => {
    const { ctx, strokes } = recorder();
    strokeContrastRing(ctx, { x: 0, y: 0 }, 5, 0.5);
    expect(strokes.map((s) => s.width)).toEqual([1.5, 0.75]);
  });
});
