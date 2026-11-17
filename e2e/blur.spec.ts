import { expect, type Page, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";
import { at, averageOf, nearly, pattern } from "./blurPattern";

// The Blur (ticket 20) in real Chromium with the real Fabric canvas and the fake platform bridge.
// The expected pixels are worked out here by hand from a known pattern, not by the renderer's code.

const W = 100;
const H = 60;

async function exportOf(page: Page, annotations: unknown[]): Promise<Uint8Array> {
  const png = await page.evaluate(
    async ({ annotations, W, H }) => {
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const { exportPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
      const { renderFinished } = await import(/* @vite-ignore */ "/src/canvas/renderFinished.ts" as string);
      const rgba = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) rgba.set([(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256, 255], (y * W + x) * 4);
      const capture = encodeRgbaPng(W, H, rgba);
      const out = await exportPng({ capture, model: { formatVersion: 1, annotations, crop: null } }, renderFinished);
      return Array.from(out as Uint8Array);
    },
    { annotations, W, H },
  );
  return Uint8Array.from(png);
}

const blur = { id: "b1", type: "blur", x: 20, y: 10, width: 48, height: 32, strength: { blockSize: 16 } };

test.describe("the Export of a Blur", () => {
  test("pixelates the region into whole blocks of their average, touches nothing else, and carries no chunk", async ({ page }) => {
    await page.goto("/");
    const png = await exportOf(page, [blur]);
    expect(hasChunk(png, "snAP")).toBe(false);

    const out = decodePixels(png);
    expect([out.width, out.height]).toEqual([W, H]);
    for (let by = 0; by < 2; by++)
      for (let bx = 0; bx < 3; bx++) {
        const x0 = 20 + bx * 16;
        const y0 = 10 + by * 16;
        const expected = averageOf(x0, y0, x0 + 16, y0 + 16);
        for (const [x, y] of [[x0, y0], [x0 + 15, y0], [x0, y0 + 15], [x0 + 15, y0 + 15], [x0 + 7, y0 + 9]] as const) {
          nearly(at(out, x, y), expected);
        }
      }
    // No unblurred pixel is left in the region (every pixel of the Capture is different).
    let unchanged = 0;
    for (let y = 10; y < 42; y++) for (let x = 20; x < 68; x++) if (at(out, x, y).join() === pattern(x, y).join()) unchanged++;
    expect(unchanged).toBeLessThan(5); // a block average can equal one pixel by chance, never more
    // Just outside the box is exactly the Capture.
    for (const [x, y] of [[19, 20], [68, 20], [30, 9], [30, 42], [0, 0], [99, 59]] as const) {
      expect(at(out, x, y)).toEqual(pattern(x, y));
    }
  });

  test("a Blur at the edge keeps a smaller last block and stays inside the box", async ({ page }) => {
    await page.goto("/");
    const out = decodePixels(await exportOf(page, [{ ...blur, x: 80, y: 40, width: 20, height: 20, strength: { blockSize: 12 } }]));
    nearly(at(out, 95, 55), averageOf(92, 52, 100, 60)); // the 8 px remainder block
    nearly(at(out, 85, 45), averageOf(80, 40, 92, 52));
    expect(at(out, 79, 45)).toEqual(pattern(79, 45));
  });

  test("pixelates an Annotation beneath it as it looks composited, not only the Capture", async ({ page }) => {
    await page.goto("/");
    // A solid red 1 px outlined rectangle whose right edge is at x = 52 (outer edge), under the Blur's box.
    const rect = {
      id: "r1",
      type: "rect",
      x: 10,
      y: 0,
      width: 41.5,
      height: 60,
      stroke: { color: "#e02424", width: 1 },
      fill: { mode: "solid", color: "#e02424", opacity: 1 },
    };
    const out = decodePixels(await exportOf(page, [rect, blur]));
    // The first two block columns lie wholly over the red rectangle: solid red, none of the Capture left.
    for (const [x, y] of [[20, 10], [35, 25], [36, 41], [51, 12]] as const) nearly(at(out, x, y), [224, 36, 36, 255]);
    // The third column is over the bare Capture again.
    nearly(at(out, 60, 20), averageOf(52, 10, 68, 26));
  });

  test("an Annotation above the Blur is not pixelated", async ({ page }) => {
    await page.goto("/");
    const rect = {
      id: "r1",
      type: "rect",
      x: 30,
      y: 20,
      width: 10,
      height: 10,
      stroke: { color: "#111827", width: 2 },
      fill: { mode: "solid", color: "#2563eb", opacity: 1 },
    };
    const out = decodePixels(await exportOf(page, [blur, rect]));
    expect(at(out, 35, 25)).toEqual([37, 99, 235, 255]);
    expect(at(out, 35, 20)).toEqual([17, 24, 39, 255]); // its outline stays crisp too
  });
});
