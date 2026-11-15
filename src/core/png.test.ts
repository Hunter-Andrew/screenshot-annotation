// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeRgbaPng, encodeRgbaPngCompressed, readSize } from "./png";
import { decodePixels } from "./testing";

// A 5 x 4 picture with flat areas and a gradient, so both repeated and changing rows are covered.
function picture(): { width: number; height: number; rgba: Uint8Array } {
  const width = 5;
  const height = 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const flat = y < 2;
      rgba.set(flat ? [10, 20, 30, 255] : [x * 50, y * 60, 255 - x * 30, 128 + x * 20], (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

describe("encodeRgbaPngCompressed", () => {
  it("makes a PNG that decodes to exactly the pixels it was given", async () => {
    const { width, height, rgba } = picture();

    const png = await encodeRgbaPngCompressed(width, height, rgba);

    expect(readSize(png)).toEqual({ width, height });
    expect(decodePixels(png)).toEqual({ width, height, rgba: Array.from(rgba) });
  });

  it("is much smaller than the uncompressed encoder on a flat screenshot", async () => {
    const width = 200;
    const height = 100;
    const rgba = new Uint8Array(width * height * 4).fill(240);

    const compressed = await encodeRgbaPngCompressed(width, height, rgba);

    expect(compressed.length).toBeLessThan(encodeRgbaPng(width, height, rgba).length / 20);
    expect(decodePixels(compressed).rgba).toEqual(Array.from(rgba));
  });

  it("rejects pixel data that does not match the size", async () => {
    await expect(encodeRgbaPngCompressed(2, 2, new Uint8Array(3))).rejects.toThrow(/size/);
  });
});
