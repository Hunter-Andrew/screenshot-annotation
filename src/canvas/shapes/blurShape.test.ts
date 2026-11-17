import { describe, expect, it, vi } from "vitest";

const pixelate = vi.fn();
vi.mock("../pixelate", () => ({ pixelate: (...args: unknown[]) => pixelate(...args) }));

import { BlurShape } from "./blurShape";

describe("BlurShape._render", () => {
  it("uses the y scale for the height when the axes are scaled differently", () => {
    const shape = new BlurShape({ width: 100, height: 50 });
    // Object space to canvas pixels: x scaled 2, y scaled 3, centre at (200, 300).
    const ctx = { getTransform: () => ({ a: 2, d: 3, e: 200, f: 300 }) } as unknown as CanvasRenderingContext2D;
    shape._render(ctx);
    const [, box] = pixelate.mock.calls[0]!;
    expect(box).toEqual({ left: 100, top: 225, width: 200, height: 150 });
  });
});
