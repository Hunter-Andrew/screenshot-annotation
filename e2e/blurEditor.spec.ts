import { expect, type Page, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";
import { at, averageOf, nearly, pattern } from "./blurPattern";
import { liveArea } from "./liveCanvas";

// The Blur tool in the editor (ticket 20): real Chromium, the real Fabric canvas, the fake bridge.

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

async function captureWithPattern(page: Page, width: number, height: number) {
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge)); // the app installs the fake bridge a moment after load
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) rgba.set([(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256, 255], (y * width + x) * 4);
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width, height },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
}

interface SavedBlur {
  type: string;
  x: number;
  y: number;
  strength: { blockSize: number };
}
async function savedBlurs(page: Page) {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never as SavedBlur[]) : [];
  });
}

/** A pixel of what the editor canvas is showing right now (it is at 100%: one pixel per pixel). */
async function livePixel(page: Page, x: number, y: number) {
  return (await liveArea(page, { x, y, w: 1, h: 1 }))!.data;
}

async function copiedPixels(page: Page) {
  const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(before + 1);
  const bytes = await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!));
  const png = Uint8Array.from(bytes);
  return { png, px: decodePixels(png) };
}

async function dragBlur(page: Page, pt: (x: number, y: number) => { x: number; y: number }, a: [number, number], b: [number, number]) {
  const from = pt(...a);
  const to = pt(...b);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

test.describe("the Blur tool in the editor", () => {
  test.use({ viewport: { width: 760, height: 560 } });

  test("B drags a box that pixelates the Capture on the canvas right away, and the Copy matches", async ({ page }) => {
    await page.goto("/");
    await captureWithPattern(page, 300, 200);
    const stage = (await page.locator(".stage").boundingBox())!;
    const pt = (x: number, y: number) => ({ x: stage.x + x, y: stage.y + y });

    await page.keyboard.press("b");
    await expect(page.getByRole("button", { name: /^Blur/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Strength" })).toBeVisible();
    await page.getByLabel("Block size").fill("16");

    await dragBlur(page, pt, [80, 60], [176, 124]);

    await expect.poll(async () => (await savedBlurs(page)).length, { timeout: 6000 }).toBe(1);
    const [blur] = await savedBlurs(page);
    expect(blur).toMatchObject({ type: "blur", strength: { blockSize: 16 } });
    expect([Math.round(blur!.x), Math.round(blur!.y)]).toEqual([80, 60]);
    // Back on Select after one use.
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");

    // The live canvas shows the pixelated Capture: one flat colour per 16 px block.
    const block = averageOf(80, 60, 96, 76);
    await expect.poll(() => livePixel(page, 90, 70)).toEqual(block.map(Math.round));
    // (clear of the selection handles, which are drawn on this canvas too)
    expect(await livePixel(page, 92, 72)).toEqual(await livePixel(page, 95, 75));
    expect(await livePixel(page, 70, 70)).toEqual(pattern(70, 70)); // outside is the Capture, as ever

    // What is copied is the same pixelation, as a plain image.
    const { png, px } = await copiedPixels(page);
    expect(hasChunk(png, "snAP")).toBe(false);
    nearly(Array.from(at(px, 90, 70)), block);
    expect(Array.from(at(px, 79, 70))).toEqual(pattern(79, 70));
  });

  test("a Blur moves, undoes and deletes like any Annotation", async ({ page }) => {
    await page.goto("/");
    await captureWithPattern(page, 300, 200);
    const stage = (await page.locator(".stage").boundingBox())!;
    const pt = (x: number, y: number) => ({ x: stage.x + x, y: stage.y + y });

    await page.keyboard.press("b");
    await dragBlur(page, pt, [40, 40], [136, 104]);
    await expect.poll(async () => (await savedBlurs(page)).length, { timeout: 6000 }).toBe(1);

    // Drag it from its middle (the whole box grabs it, it is not outline-only) 100 px to the right.
    const grab = pt(88, 72);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 50, grab.y, { steps: 5 });
    await page.mouse.move(grab.x + 100, grab.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await savedBlurs(page))[0]!.x), { timeout: 6000 }).toBe(140);
    let copy = await copiedPixels(page);
    expect(Array.from(at(copy.px, 60, 60))).toEqual(pattern(60, 60)); // the old place is plain again
    nearly(Array.from(at(copy.px, 150, 50)), averageOf(140, 40, 152, 52));

    await page.keyboard.press("Control+z");
    await expect.poll(async () => Math.round((await savedBlurs(page))[0]!.x), { timeout: 6000 }).toBe(40);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(async () => Math.round((await savedBlurs(page))[0]!.x), { timeout: 6000 }).toBe(140);

    await page.keyboard.press("Delete");
    await expect.poll(async () => (await savedBlurs(page)).length, { timeout: 6000 }).toBe(0);
    copy = await copiedPixels(page);
    expect(Array.from(at(copy.px, 150, 50))).toEqual(pattern(150, 50));
  });

  test("a Blur drawn over an Annotation pixelates it too, live", async ({ page }) => {
    await page.goto("/");
    await captureWithPattern(page, 300, 200);
    const stage = (await page.locator(".stage").boundingBox())!;
    const pt = (x: number, y: number) => ({ x: stage.x + x, y: stage.y + y });

    await page.keyboard.press("r");
    await page.getByRole("button", { name: "Solid" }).click();
    await dragBlur(page, pt, [20, 20], [120, 100]);
    await expect.poll(async () => (await savedBlurs(page)).length, { timeout: 6000 }).toBe(1);

    await page.keyboard.press("b");
    await dragBlur(page, pt, [60, 40], [156, 88]); // 12 px blocks (the default): 8 x 4
    await expect.poll(async () => (await savedBlurs(page)).length, { timeout: 6000 }).toBe(2);

    // The first block column is wholly over the solid rectangle (to x = 120): flat rectangle colour,
    // none of the Capture beneath showing through. The last column is over the bare Capture.
    const rectColor = await livePixel(page, 30, 30);
    expect(rectColor.slice(0, 3)).not.toEqual(pattern(30, 30).slice(0, 3));
    await expect.poll(() => livePixel(page, 65, 45)).toEqual(rectColor);
    await expect.poll(() => livePixel(page, 150, 45)).toEqual(averageOf(144, 40, 156, 52).map(Math.round));
  });
});
