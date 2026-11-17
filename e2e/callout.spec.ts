import { expect, type Page, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";

// The Callout in real Chromium with the real Fabric canvas and the fake bridge.

interface Callout {
  id: string;
  type: "callout";
  x: number;
  y: number;
  width: number;
  text: string;
  tail: { enabled: boolean };
  tip?: { x: number; y: number };
  stroke: { color: string; width: number };
  fill: { mode: string; color: string };
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

test.use({ viewport: { width: 1100, height: 760 } });

async function capture(page: Page, width: number, height: number) {
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4).fill(200);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width, height },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
}

async function saved(page: Page): Promise<Callout[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}

async function expectSaved(page: Page, check: (c: Callout[]) => boolean, message: string) {
  await expect.poll(async () => check(await saved(page)), { message, timeout: 6000, intervals: [200] }).toBe(true);
}

async function copyPixels(page: Page) {
  const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(before + 1);
  const bytes = await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!));
  const png = Uint8Array.from(bytes);
  const px = decodePixels(png);
  return { png, at: (x: number, y: number) => Array.from(px.rgba.slice((y * px.width + x) * 4, (y * px.width + x) * 4 + 4)) };
}

test("O draws a callout: text in a speech box, a tail you can drag and switch off", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 400);
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  const box = (await page.locator(".stage").boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });

  await page.keyboard.press("o");
  await expect(page.getByRole("button", { name: /^Callout/ })).toHaveAttribute("aria-pressed", "true");
  const p = at(100, 100);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type("Look here");
  await page.keyboard.press("Escape");

  await expectSaved(page, ([c]) => c?.text === "Look here", "the callout is saved");
  const [made] = await saved(page);
  expect(made).toMatchObject({ type: "callout", tail: { enabled: true }, fill: { mode: "solid", color: "#ffffff" } });
  for (const name of ["Font", "Text outline", "Stroke", "Fill", "Tail"]) await expect(page.getByRole("region", { name })).toBeVisible();

  // Burned in: white speech box around the text on the grey capture, and a tail below it.
  let pixels = await copyPixels(page);
  expect(pixels.at(100 - 5, 100 - 5)).toEqual([255, 255, 255, 255]); // inside the padding, left of the text
  const tailX = Math.round(made!.x + Math.min(32, made!.width / 4));
  // The tail narrows to its tip: white just under the box, and the last white row in this column is the tip.
  expect(pixels.at(tailX, Math.round(made!.y) + 40)[0]).toBeGreaterThan(230);
  let tipY = Math.round(made!.y) + 40;
  while (pixels.at(tailX, tipY + 1)[0] > 230) tipY++;
  expect(hasChunk(pixels.png, "snAP")).toBe(false);

  // Drag the tail's handle (at the tip) to the right and up: the tip is stored, relative to the box.
  // The last white row is just inside the tail's stroke: the tip (and its handle) is a few pixels further down.
  const handle = at(tailX, tipY + 4);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y - 10, { steps: 5 });
  await page.mouse.move(handle.x + 120, handle.y - 20, { steps: 5 });
  await page.mouse.up();
  await expectSaved(page, ([c]) => !!c?.tip && c.tip.x > Math.min(32, made!.width / 4) + 80, "the dragged tip is saved");
  const [dragged] = await saved(page);
  expect(dragged!.x).toBe(made!.x); // the box did not move

  // Switch the tail off: no white below the box any more.
  await page.getByRole("region", { name: "Tail" }).getByRole("button", { name: "Off" }).click();
  await expectSaved(page, ([c]) => c?.tail.enabled === false, "the tail switch is saved");
  pixels = await copyPixels(page);
  expect(pixels.at(tailX, Math.round(made!.y) + 40)).toEqual([200, 200, 200, 255]);
});
