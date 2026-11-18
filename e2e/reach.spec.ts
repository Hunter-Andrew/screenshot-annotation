import { expect, type Page, test } from "@playwright/test";
import { legacyMargins } from "./sameCropMargin";

legacyMargins(test);
import { decodePixels } from "../src/core/testing";

// How far a drag reaches (M4 fixes C): a press that starts on the canvas (its margin included) keeps following the
// pointer wherever it goes, outside the canvas element and outside the window, until the image's 8192 px limit.
// The Canvas margin setting only decides the margin that is shown; it is not a limit on a drag.

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
}
type InPage = { __fakeBridge: Bridge };

test.use({ viewport: { width: 1000, height: 700 } });

async function capture(page: Page, width: number, height: number) {
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4).fill(128);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width, height },
  );
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  const stage = (await page.locator(".stage").boundingBox())!;
  expect(stage.width).toBe(width); // 100%: one screen pixel per image pixel
  return { at: (x: number, y: number) => ({ x: stage.x + x, y: stage.y + y }) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

/** The size of what Copy puts on the clipboard: the visible area, in pixels. */
async function copiedSize(page: Page) {
  const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(before + 1);
  const bytes = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!)));
  const { width, height } = decodePixels(bytes);
  return { width, height };
}

const near = (value: number, expected: number, tolerance = 4) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(tolerance);

test.describe("a drag follows the pointer past the canvas and the window", () => {
  test("a rectangle dragged far down and right, outside the window, grows the image as far as the pointer", async ({ page }) => {
    await page.goto("/");
    const view = await capture(page, 300, 200);
    await page.keyboard.press("r");
    await drag(page, view.at(200, 50), view.at(1500, 900));

    const size = await copiedSize(page);
    near(size.width, 1500 + 2); // from the Capture's left edge to the rectangle's right edge (and half its 4 px outline)
    near(size.height, 900 + 2);
    // Fit then re-fits the bigger image into the well; nothing is left stuck.
    const area = (await page.locator(".area").boundingBox())!;
    expect(area.width).toBeLessThan(900);
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("a rectangle dragged far up and left, past the window's top left corner, grows the image up and to the left", async ({ page }) => {
    await page.goto("/");
    const view = await capture(page, 300, 200);
    await page.keyboard.press("r");
    await drag(page, view.at(100, 100), view.at(-1200, -800));

    const size = await copiedSize(page);
    near(size.width, 300 + 1200 + 2);
    near(size.height, 200 + 800 + 2);
  });

  test("a rectangle drawn with Undo and Redo around it: one step, the same size", async ({ page }) => {
    await page.goto("/");
    const view = await capture(page, 300, 200);
    await page.keyboard.press("r");
    await drag(page, view.at(200, 50), view.at(1500, 900));
    await page.keyboard.press("Control+z");
    expect(await copiedSize(page)).toEqual({ width: 300, height: 200 });
    await page.keyboard.press("Control+Shift+z");
    near((await copiedSize(page)).width, 1502);
  });

  test("an Annotation moved far outside the window takes the image with it", async ({ page }) => {
    await page.goto("/");
    const view = await capture(page, 300, 200);
    await page.keyboard.press("r");
    await drag(page, view.at(50, 50), view.at(150, 100));
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    // Grab it by its outline (at the left edge, clear of the handle in the middle of it) and drag it 1800 px right and 1000 down.
    const grab = view.at(50, 65);
    await drag(page, grab, { x: grab.x + 1800, y: grab.y + 1000 });

    const size = await copiedSize(page);
    near(size.width, 50 + 1800 + 100 + 2, 6); // its right edge is now at 1950
    near(size.height, 50 + 1000 + 50 + 2, 6);
  });

  test("a Crop rectangle dragged out of the window sets the area to it, with the Capture inside", async ({ page }) => {
    await page.goto("/");
    const view = await capture(page, 300, 200);
    await page.keyboard.press("c");
    await drag(page, view.at(100, 50), view.at(1800, 1200));

    const size = await copiedSize(page);
    near(size.width, 1700);
    near(size.height, 1150);
  });

  test("an area handle dragged out of the window expands the area as far as the pointer", async ({ page }) => {
    await page.goto("/");
    const view = await capture(page, 300, 200);
    await page.keyboard.press("c");
    await drag(page, view.at(300, 100), view.at(1800, 100)); // the right-middle handle
    near((await copiedSize(page)).width, 1800, 8);

    // And a corner handle, now on the bigger image, back to the left and far up.
    const area = (await page.locator(".area").boundingBox())!;
    await drag(page, { x: area.x, y: area.y }, { x: -900, y: -600 });
    const size = await copiedSize(page);
    expect(size.width).toBeGreaterThan(2500);
    expect(size.height).toBeGreaterThan(700);
  });

  test("the image stops at 8192 px on a side, with the plain message", async ({ page }) => {
    await page.goto("/");
    const view = await capture(page, 300, 200);
    await page.keyboard.press("r");
    await drag(page, view.at(200, 50), view.at(20000, 120));

    const size = await copiedSize(page);
    expect(size.width).toBe(8192);
    expect(size.height).toBe(200);
    await expect(page.getByText("The image can be at most 8192 pixels on a side")).toBeVisible();
  });

  test("a press that starts outside the canvas (on the top bar) draws nothing", async ({ page }) => {
    await page.goto("/");
    const view = await capture(page, 300, 200);
    await page.keyboard.press("r");
    await drag(page, { x: 600, y: 20 }, view.at(250, 150));
    expect(await copiedSize(page)).toEqual({ width: 300, height: 200 });
  });

  test("after a manual zoom a drag far up and left still reaches as far as the pointer (the view keeps what was on screen)", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    const stage = (await page.locator(".stage").boundingBox())!;
    const scale = stage.width / 300;
    expect(scale).toBeGreaterThan(1.4);
    const at = (x: number, y: number) => ({ x: stage.x + x * scale, y: stage.y + y * scale });
    await page.keyboard.press("r");
    // From inside the Capture to a point 1000 px (screen) left of and 700 above the window.
    const from = at(100, 100);
    await drag(page, from, { x: -1000, y: -700 });

    const size = await copiedSize(page);
    // The rectangle's far corner is where the pointer is, in Capture pixels; the Capture's own right and bottom edges close the area.
    const [px, py] = [(-1000 - stage.x) / scale, (-700 - stage.y) / scale];
    near(size.width, 300 - px + 2, 8);
    near(size.height, 200 - py + 2, 8);
  });
});

