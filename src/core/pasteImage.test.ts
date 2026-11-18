// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkPastedImage, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, MAX_IMAGES, placeImage } from "./pasteImage";
import { encodeRgbaPng } from "./png";

const png = (width: number, height: number) => encodeRgbaPng(width, height, new Uint8Array(width * height * 4));

/** A PNG whose header says `width` x `height` without holding that many pixels (the check reads only the header). */
function claiming(width: number, height: number): Uint8Array {
  const real = png(1, 1);
  const view = new DataView(real.buffer, real.byteOffset, real.byteLength);
  view.setUint32(16, width); // IHDR data starts at byte 16
  view.setUint32(20, height);
  return real;
}

describe("the limits on a pasted image", () => {
  it("are 8192 px a side, about 25 MB, and 20 images", () => {
    expect([MAX_IMAGE_SIDE, MAX_IMAGES]).toEqual([8192, 20]);
    expect(MAX_IMAGE_BYTES).toBe(25 * 1024 * 1024);
  });

  it("accepts a picture inside them and reports its size", () => {
    expect(checkPastedImage(png(30, 20), 0)).toEqual({ ok: true, width: 30, height: 20 });
    expect(checkPastedImage(claiming(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), 19)).toMatchObject({ ok: true, width: 8192 });
  });

  it("refuses a side over 8192 px with a message that names the size, and never resamples", () => {
    const wide = checkPastedImage(claiming(MAX_IMAGE_SIDE + 1, 10), 0);
    expect(wide).toEqual({ ok: false, message: expect.stringContaining("8193 x 10") });
    const tall = checkPastedImage(claiming(10, MAX_IMAGE_SIDE + 1), 0);
    expect(tall.ok).toBe(false);
    expect(wide.ok === false && wide.message).toContain("8192");
  });

  it("refuses more than about 25 MB of PNG data", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(png(2, 2));
    const result = checkPastedImage(big, 0);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/25 MB/);
    // Exactly at the limit is fine (the bytes after IEND are ignored by the reader).
    const exact = new Uint8Array(MAX_IMAGE_BYTES);
    exact.set(png(2, 2));
    expect(checkPastedImage(exact, 0).ok).toBe(true);
  });

  it("refuses a 21st image", () => {
    const result = checkPastedImage(png(2, 2), MAX_IMAGES);
    expect(result).toEqual({ ok: false, message: expect.stringContaining("20") });
  });

  it("refuses bytes that are not a PNG", () => {
    expect(checkPastedImage(new Uint8Array([1, 2, 3]), 0).ok).toBe(false);
  });
});

describe("placing a pasted image", () => {
  const capture = { width: 1000, height: 600 };
  const whole = { x: 0, y: 0, ...capture };

  it("centres it at 100% of its pixel size in the visible area", () => {
    expect(placeImage({ width: 200, height: 100 }, capture, whole)).toEqual({ x: 400, y: 250, width: 200, height: 100 });
    // A zoomed-in view that shows only the top-left 400 x 300 of the Capture.
    expect(placeImage({ width: 200, height: 100 }, capture, { x: 0, y: 0, width: 400, height: 300 })).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it("scales an image bigger than the Capture down to fit inside it, keeping its shape", () => {
    const placed = placeImage({ width: 2000, height: 600 }, capture, whole);
    expect(placed).toEqual({ x: 0, y: 150, width: 1000, height: 300 });
    const tall = placeImage({ width: 500, height: 1200 }, capture, whole);
    expect(tall).toEqual({ x: 375, y: 0, width: 250, height: 600 });
  });

  it("does not scale an image that fits the Capture, even when it is bigger than the visible area", () => {
    const placed = placeImage({ width: 900, height: 500 }, capture, { x: 0, y: 0, width: 300, height: 200 });
    expect([placed.width, placed.height]).toEqual([900, 500]);
    // It stays inside the Capture: pulled back from where centring on the view would put it.
    expect(placed.x).toBeGreaterThanOrEqual(0);
    expect(placed.x + placed.width).toBeLessThanOrEqual(1000);
    expect(placed.y + placed.height).toBeLessThanOrEqual(600);
  });

  it("centres in the part of the view that is over the Capture when the view is partly outside it", () => {
    // The well shows 300..1300 horizontally; only 300..1000 is Capture.
    const placed = placeImage({ width: 100, height: 100 }, capture, { x: 300, y: 0, width: 1000, height: 600 });
    expect(placed).toEqual({ x: 600, y: 250, width: 100, height: 100 });
  });

  it("never changes the Capture's size: it is not an input that grows", () => {
    const placed = placeImage({ width: 5000, height: 5000 }, capture, whole);
    expect(placed.x).toBeGreaterThanOrEqual(0);
    expect(placed.y).toBeGreaterThanOrEqual(0);
    expect(placed.x + placed.width).toBeLessThanOrEqual(capture.width);
    expect(placed.y + placed.height).toBeLessThanOrEqual(capture.height);
  });
});
