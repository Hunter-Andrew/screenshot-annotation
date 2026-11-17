import { expect } from "@playwright/test";
import type { Pixels } from "../src/core/testing";

// Shared by the Blur specs: a Capture in which every pixel differs, and the expected pixelation of
// it worked out here by hand (not by the renderer's code).

/** The Capture: every pixel is different, so an unblurred pixel can never pass for a pixelated one. */
export const pattern = (x: number, y: number) => [(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256, 255];

export const at = (p: Pixels, x: number, y: number) => {
  const i = (y * p.width + x) * 4;
  return p.rgba.slice(i, i + 4);
};

/** The average colour of a block of `colorAt` (the Capture by default), the way pixelating means it. */
export function averageOf(x0: number, y0: number, x1: number, y1: number, colorAt: (x: number, y: number) => number[] = pattern) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const c = colorAt(x, y);
      for (let k = 0; k < 3; k++) sum[k]! += c[k]!;
      n++;
    }
  return [...sum.map((s) => s / n), 255];
}

/** Within one level per channel: the expected values are averages, the canvas rounds. */
export const nearly = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(4);
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThanOrEqual(1));
};
