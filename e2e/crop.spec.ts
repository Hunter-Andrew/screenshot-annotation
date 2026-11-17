import { expect, type Page, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";

// Crop on the real Fabric canvas with the fake platform bridge: drag a rectangle with C, see the rest
// dimmed, and check that Copy, Save as PNG and the Library file's visible pixels carry only the cropped
// area while the Capture inside the file is untouched.

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  savedAs: { bytes: Uint8Array }[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

const W = 600;
const H = 400;

async function capture(page: Page) {
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4).fill(200);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width: W, height: H },
  );
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

/** The newest Library file, decoded as the next app start would: its crop, the embedded Capture's checksum and the visible size. */
const libraryFile = (page: Page) =>
  page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const { readSize } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1)!;
    const decoded = decodeLibraryPng(file.bytes);
    let sum = 0;
    for (const byte of decoded.capture as Uint8Array) sum = (sum * 31 + byte) >>> 0;
    const visible = readSize(file.bytes);
    return { crop: decoded.model.crop, capture: sum, visible: [visible.width, visible.height] };
  });

test.use({ viewport: { width: 1000, height: 700 } });

test.describe("Crop", () => {
  test("C, drag, and Copy, Save as and the Library file show only the cropped area; widening restores it", async ({ page }) => {
    await page.goto("/");
    await capture(page);
    const original = await libraryFile(page);
    // Where the Capture is on screen now: Fit re-fits after every change of the visible area (ticket 37).
    const view = async () => {
      const stage = (await page.locator(".stage").boundingBox())!;
      const scale = stage.width / W;
      return { scale, at: (x: number, y: number) => ({ x: stage.x + x * scale, y: stage.y + y * scale }) };
    };

    await page.keyboard.press("c");
    await expect(page.getByRole("button", { name: /^Crop/ })).toHaveAttribute("aria-pressed", "true");
    let { at } = await view();
    await drag(page, at(100, 50), at(400, 250));

    // The tool went back to Select; the rest is dimmed (on the canvas) with a visible border, the whole Capture is still shown.
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    const frame = page.locator(".crop-frame");
    await expect(frame).toBeVisible();
    const box = (await frame.boundingBox())!;
    const { scale } = await view();
    expect(box.width / scale).toBeCloseTo(300, -1);
    expect(box.height / scale).toBeCloseTo(200, -1);
    expect(await frame.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();

    // Copy: exactly the cropped pixels, no editable data.
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
    const copied = await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!));
    const cropped = decodePixels(Uint8Array.from(copied));
    expect(Math.abs(cropped.width - 300)).toBeLessThanOrEqual(3);
    expect(Math.abs(cropped.height - 200)).toBeLessThanOrEqual(3);
    expect(hasChunk(Uint8Array.from(copied), "snAP")).toBe(false);

    // Save as PNG: the same.
    await page.getByRole("button", { name: "Save as PNG…" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.savedAs.length)).toBe(1);
    const saved = await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.savedAs[0]!.bytes));
    expect([decodePixels(Uint8Array.from(saved)).width, decodePixels(Uint8Array.from(saved)).height]).toEqual([cropped.width, cropped.height]);
    expect(hasChunk(Uint8Array.from(saved), "snAP")).toBe(false);

    // The Library file: visible pixels are the cropped area (so its thumbnail is), the embedded Capture is unaltered.
    await expect
      .poll(async () => (await libraryFile(page)).crop, { timeout: 6000, intervals: [200] })
      .not.toBeNull();
    const file = await libraryFile(page);
    expect(file.visible).toEqual([cropped.width, cropped.height]);
    expect(file.capture).toEqual(original.capture);

    // Widen by drawing a bigger rectangle (a drag reaches a quarter of the area into the margin around it, so
    // a 300 x 200 crop widens to at most 450 x 300 in one go), then remove the crop: the original area is back.
    await page.keyboard.press("c");
    ({ at } = await view());
    await drag(page, at(40, 10), at(460, 290));
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect
      .poll(async () => decodePixels(Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!)))).width)
      .toBeGreaterThan(400);

    await page.getByRole("button", { name: "Remove crop" }).click();
    await expect(page.locator(".crop-frame")).toHaveCount(0);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect
      .poll(async () => {
        const last = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!)));
        const p = decodePixels(last);
        return [p.width, p.height];
      })
      .toEqual([W, H]);
    await expect.poll(async () => (await libraryFile(page)).crop, { timeout: 6000, intervals: [200] }).toBeNull();
    expect((await libraryFile(page)).visible).toEqual([W, H]);
    expect((await libraryFile(page)).capture).toEqual(original.capture);
  });

  test("a click or a tiny drag with the Crop tool sets nothing, and Undo takes a crop back", async ({ page }) => {
    await page.goto("/");
    await capture(page);
    const stage = (await page.locator(".stage").boundingBox())!;

    await page.keyboard.press("c");
    await page.mouse.click(stage.x + 100, stage.y + 100);
    await expect(page.locator(".crop-frame")).toHaveCount(0);

    await drag(page, { x: stage.x + 100, y: stage.y + 100 }, { x: stage.x + 300, y: stage.y + 250 });
    await expect(page.locator(".crop-frame")).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(page.locator(".crop-frame")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".crop-frame")).toBeVisible();
  });
});
