import { describe, expect, it } from "vitest";
import { resample } from "./lanczos";

function checker(w: number, h: number, cell: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 255 : 0;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return data;
}

describe("resample", () => {
  it("keeps a flat colour flat", () => {
    const flat = new Uint8ClampedArray(40 * 40 * 4).fill(120);
    const out = resample(flat, 40, 40, 29, 29);
    expect(out.length).toBe(29 * 29 * 4);
    expect(Math.min(...out)).toBe(120);
    expect(Math.max(...out)).toBe(120);
  });

  it("keeps a hard edge steeper than plain averaging", () => {
    // Left half black, right half white, shrunk to 72%.
    const w = 100, h = 4;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src.set([x < 50 ? 0 : 255, 0, 0, 255], (y * w + x) * 4);
    const out = resample(src, w, h, 72, 3);
    const row = Array.from({ length: 72 }, (_, x) => out[x * 4]!);
    const transition = row.filter((v) => v > 20 && v < 235).length;
    expect(transition).toBeLessThanOrEqual(3);
    expect(row[0]).toBe(0);
    expect(row[71]).toBe(255);
  });

  it("does not leak colour from transparent pixels", () => {
    const src = new Uint8ClampedArray(8 * 8 * 4); // fully transparent black
    for (let i = 0; i < 8 * 8; i++) src.set([10, 200, 30, 0], i * 4);
    const out = resample(src, 8, 8, 5, 5);
    expect(out[3]).toBe(0);
  });

  it("returns the size asked for", () => {
    expect(resample(checker(64, 48, 4), 64, 48, 46, 35).length).toBe(46 * 35 * 4);
  });
});
