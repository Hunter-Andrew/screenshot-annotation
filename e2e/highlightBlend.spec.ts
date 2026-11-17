import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";
import { liveArea } from "./liveCanvas";

// The Highlighter's multiply blend in real Chromium with the real Fabric canvas: on the editor canvas, in the
// Export, and under a Blur. The expected colours are worked out here by hand: multiply is channel x channel / 255,
// so #ffee00 over white is #ffee00, over black is black, and white text under it comes out #ffee00.

const W = 300;
const H = 200;
const YELLOW = [255, 238, 0, 255];
const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

/** The Capture: white on the left with a black text bar at x 40-59; black on the right with a white text bar at x 210-229. */
function capturePixel(x: number): number[] {
  if (x < 150) return x >= 40 && x < 60 ? BLACK : WHITE;
  return x >= 210 && x < 230 ? WHITE : BLACK;
}

const highlight = {
  id: "h1",
  type: "highlight",
  points: [{ x: 20, y: 100 }, { x: 280, y: 100 }],
  stroke: { color: "#ffee00", width: 20 },
  opacity: { value: 1 },
};

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

const bar = (x: number) => capturePixel(x);

async function exportOf(page: Page, annotations: unknown[]) {
  const png = await page.evaluate(
    async ({ annotations, W, H, columns }) => {
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const { exportPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
      const { renderFinished } = await import(/* @vite-ignore */ "/src/canvas/renderFinished.ts" as string);
      const rgba = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(columns[x]!, (y * W + x) * 4);
      const capture = encodeRgbaPng(W, H, rgba);
      const out = await exportPng({ capture, model: { formatVersion: 1, annotations, crop: null } }, renderFinished);
      return Array.from(out as Uint8Array);
    },
    { annotations, W, H, columns: Array.from({ length: W }, (_, x) => bar(x)) },
  );
  return decodePixels(Uint8Array.from(png));
}

const px = (p: { width: number; rgba: ArrayLike<number> }, x: number, y: number) =>
  [0, 1, 2, 3].map((k) => p.rgba[(y * p.width + x) * 4 + k]!);

test.describe("the Highlighter's multiply blend", () => {
  test.use({ viewport: { width: 760, height: 560 } });

  test("Export: yellow over white is yellow, over black text is black, over white text on a dark background is yellow", async ({ page }) => {
    await page.goto("/");
    const out = await exportOf(page, [highlight]);
    expect(px(out, 100, 100)).toEqual(YELLOW);
    expect(px(out, 50, 100)).toEqual(BLACK); // black text under the stroke stays black
    expect(px(out, 180, 100)).toEqual(BLACK); // a dark background stays dark
    expect(px(out, 220, 100)).toEqual(YELLOW); // white text on it comes out yellow
    expect(px(out, 100, 60)).toEqual(WHITE); // beside the stroke: untouched
    expect(px(out, 220, 60)).toEqual(WHITE);
  });

  test("Export: at 50% opacity the blend is half way between the Capture and the multiplied colour", async ({ page }) => {
    await page.goto("/");
    const out = await exportOf(page, [{ ...highlight, opacity: { value: 0.5 } }]);
    const [r, g, b] = px(out, 100, 100);
    expect(r).toBe(255);
    expect(Math.abs(g! - 246.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(b! - 127.5)).toBeLessThanOrEqual(1);
  });

  test("a Blur over a highlighted area pixelates the multiplied colour, not the bare Capture", async ({ page }) => {
    await page.goto("/");
    const blur = { id: "b1", type: "blur", x: 70, y: 92, width: 48, height: 12, strength: { blockSize: 12 } };
    const out = await exportOf(page, [highlight, blur]);
    for (const [x, y] of [[71, 93], [100, 98], [116, 103]] as const) expect(px(out, x, y)).toEqual(YELLOW);
    // A Blur under the highlight (drawn first) leaves the highlight sharp on top.
    const under = await exportOf(page, [blur, highlight]);
    expect(px(under, 100, 100)).toEqual(YELLOW);
  });

  test("the editor canvas draws the same multiply, the default is #ffee00 at 100%, and Copy matches", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(
      ({ W, H, columns }) => {
        const rgba = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(columns[x]!, (y * W + x) * 4);
        (window as unknown as InPage).__fakeBridge.simulateCapture({ width: W, height: H, rgba, capturedAt: new Date() });
      },
      { W, H, columns: Array.from({ length: W }, (_, x) => bar(x)) },
    );
    await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
    await expect(page.getByText(/Saved to/)).toBeVisible();
    await expect(page.locator(".canvas-container")).toHaveCount(1);
    await page.getByRole("button", { name: "100%" }).click();
    await expect(page.getByLabel("Zoom level")).toHaveText("100%");
    const stage = (await page.locator(".stage").boundingBox())!;

    await page.keyboard.press("h");
    await expect(page.getByRole("button", { name: /^Highlighter/ })).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(stage.x + 20, stage.y + 100);
    await page.mouse.down();
    await page.mouse.move(stage.x + 150, stage.y + 100, { steps: 6 });
    await page.mouse.move(stage.x + 280, stage.y + 100, { steps: 6 });
    await page.mouse.up();

    const live = async (x: number, y: number) => Array.from((await liveArea(page, { x, y, w: 1, h: 1 }))!.data);
    await expect.poll(() => live(100, 100)).toEqual(YELLOW);
    expect(await live(50, 100)).toEqual(BLACK);
    expect(await live(180, 100)).toEqual(BLACK);
    expect(await live(220, 100)).toEqual(YELLOW);
    expect(await live(100, 60)).toEqual(WHITE);

    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
    const copied = decodePixels(Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[0]!))));
    expect(px(copied, 100, 100)).toEqual(YELLOW);
    expect(px(copied, 50, 100)).toEqual(BLACK);
    expect(px(copied, 220, 100)).toEqual(YELLOW);

    const savedHighlights = (): Promise<Record<string, unknown>[]> => page.evaluate(async () => {
      const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
      const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
      return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
    });
    await expect.poll(async () => (await savedHighlights()).length, { timeout: 6000 }).toBe(1);
    expect((await savedHighlights())[0]).toMatchObject({ type: "highlight", stroke: { color: "#ffee00" }, opacity: { value: 1 } });
  });
});
