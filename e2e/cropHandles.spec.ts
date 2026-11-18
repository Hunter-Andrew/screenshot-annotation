import { expect, type Page, test } from "@playwright/test";
import { legacyMargins } from "./sameCropMargin";

legacyMargins(test);
import { cropHandles, expectedCropHandles, sameSpots } from "./liveCanvas";

// The Crop tool's eight handles must always sit on the corners and edge middles of the visible area (M4 fixes C):
// after an Annotation grew the area past the Capture's edge, after it shrank back, after Undo and Redo, after an image
// is reopened from the Library Strip and after a zoom or Fit change.

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
}
type InPage = { __fakeBridge: Bridge };

/** A plain grey Capture (so the handle colour is found only on handles). */
async function capture(page: Page, width: number, height: number, grey = 128) {
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
  await page.evaluate(
    ({ width, height, grey }) => {
      const rgba = new Uint8Array(width * height * 4).fill(grey);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width, height, grey },
  );
  await expect(page.getByText(/Saved to/).first()).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

/** Polls until the handles are the eight expected ones (the area may still be re-fitting). */
async function expectHandlesOnArea(page: Page) {
  await expect
    .poll(async () => sameSpots(await cropHandles(page), await expectedCropHandles(page)), {
      message: "the eight handles are on the corners and edge middles of the visible area",
      timeout: 4000,
    })
    .toBe(true);
}

const areaWidth = async (page: Page) => Math.round((await page.locator(".area").boundingBox())!.width);
const stageBox = async (page: Page) => (await page.locator(".stage").boundingBox())!;

test.use({ viewport: { width: 1000, height: 700 } });

test.describe("the Crop tool's handles follow the visible area", () => {
  test("at rest, on the Capture", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await page.keyboard.press("c");
    await expectHandlesOnArea(page);
  });

  test("after a rectangle drawn past the edge grew the area, and after it shrank back", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);
    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });
    await expect.poll(() => areaWidth(page)).toBeGreaterThan(320);

    await page.keyboard.press("c");
    await expectHandlesOnArea(page);

    // Back to Select, move the rectangle inside again: the area shrinks to the Capture.
    await page.keyboard.press("v");
    const area = (await page.locator(".area").boundingBox())!;
    const grab = { x: area.x + 260, y: area.y + 50 }; // on its top edge, clear of the handles
    await drag(page, grab, { x: grab.x - 80, y: grab.y });
    await expect.poll(() => areaWidth(page)).toBe(300);
    await page.keyboard.press("c");
    await expectHandlesOnArea(page);
  });

  test("after a callout with a tail grew the area up and to the left, and after Undo and Redo", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);
    await page.keyboard.press("o");
    await drag(page, { x: stage.x + 100, y: stage.y + 80 }, { x: stage.x + 20, y: stage.y + 20 });
    await page.keyboard.press("Escape");
    await page.keyboard.press("c");
    await expectHandlesOnArea(page);
    await page.keyboard.press("Control+z");
    await expectHandlesOnArea(page);
    await page.keyboard.press("Control+Shift+z");
    await expectHandlesOnArea(page);
  });

  test("after the cause was deleted, after a zoom and after Fit", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);
    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });
    await page.keyboard.press("Delete");
    await expect.poll(() => areaWidth(page)).toBe(300);
    await page.keyboard.press("c");
    await expectHandlesOnArea(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expectHandlesOnArea(page);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await expectHandlesOnArea(page);
  });

  test("after an image with a grown area is reopened from the Library Strip", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);
    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });
    await expect.poll(() => areaWidth(page)).toBeGreaterThan(320);
    // Let the file be saved, take a second Capture (a smaller one), then go back to the first.
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const rgba = new Uint8Array(200 * 100 * 4).fill(128);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width: 200, height: 100, rgba, capturedAt: new Date(Date.now() + 5000) });
    });
    await expect.poll(() => areaWidth(page)).toBeLessThan(250);
    await page.getByRole("region", { name: "Library Strip" }).getByRole("button", { name: /^Open image/ }).last().click();
    await expect.poll(() => areaWidth(page)).toBeGreaterThan(320);
    await page.keyboard.press("c");
    await expectHandlesOnArea(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expectHandlesOnArea(page);
  });

  test("after a handle was dragged out, then in, then Undo", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await page.keyboard.press("c");
    const area = (await page.locator(".area").boundingBox())!;
    await drag(page, { x: area.x + area.width, y: area.y + area.height / 2 }, { x: area.x + area.width + 30, y: area.y + area.height / 2 });
    await expectHandlesOnArea(page);
    const wider = (await page.locator(".area").boundingBox())!;
    await drag(page, { x: wider.x, y: wider.y + wider.height / 2 }, { x: wider.x + 60, y: wider.y + wider.height / 2 });
    await expectHandlesOnArea(page);
    await page.keyboard.press("Control+z");
    await expectHandlesOnArea(page);
    await page.keyboard.press("Control+z");
    await expectHandlesOnArea(page);
  });
});

test.describe("the Crop tool's handles when the area does not start at the Capture's corner", () => {
  test("after an ellipse drawn out to the left grew the area leftwards, once the view has settled", async ({ page }) => {
    await page.goto("/");
    await capture(page, 500, 300);
    await page.keyboard.press("e");
    await drag(page, { x: 478, y: 397 }, { x: 121, y: 238 }); // from inside the Capture out over the toolbar column
    await expect.poll(async () => Number.parseInt((await page.getByLabel("Zoom level").textContent())!, 10)).toBeLessThan(90); // Fit re-fitted the bigger image
    await page.waitForTimeout(600); // nothing changes after this: the handles must be right without any later layout change
    await page.keyboard.press("c");
    await expectHandlesOnArea(page);
  });

  test("after a crop that starts inside the Capture, when the Crop tool is chosen again", async ({ page }) => {
    await page.goto("/");
    await capture(page, 500, 300);
    const stage = await stageBox(page);
    await page.keyboard.press("c");
    await drag(page, { x: stage.x + 100, y: stage.y + 50 }, { x: stage.x + 400, y: stage.y + 250 });
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(600);
    await page.keyboard.press("c");
    await expectHandlesOnArea(page);
  });
});

test.describe("the Crop tool's corner handles never lock the aspect ratio", () => {
  for (const shift of [false, true]) {
    test(`a diagonal drag resizes the area freely in both axes${shift ? " with Shift held" : ""}`, async ({ page }) => {
      await page.goto("/");
      await capture(page, 300, 200);
      await page.keyboard.press("c");
      const before = (await page.locator(".area").boundingBox())!;
      // The bottom-right corner 40 px out and 30 px in: 340 x 170, not a 3:2 rectangle.
      if (shift) await page.keyboard.down("Shift");
      await drag(page, { x: before.x + before.width, y: before.y + before.height }, { x: before.x + before.width + 40, y: before.y + before.height - 30 });
      if (shift) await page.keyboard.up("Shift");
      const after = (await page.locator(".area").boundingBox())!;
      expect(Math.abs(after.width - 340)).toBeLessThanOrEqual(5);
      expect(Math.abs(after.height - 170)).toBeLessThanOrEqual(5);
    });
  }

  test("the top-left corner too, in both directions", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await page.keyboard.press("c");
    const before = (await page.locator(".area").boundingBox())!;
    await drag(page, { x: before.x, y: before.y }, { x: before.x + 50, y: before.y - 20 });
    const after = (await page.locator(".area").boundingBox())!;
    expect(Math.abs(after.width - 250)).toBeLessThanOrEqual(5);
    expect(Math.abs(after.height - 220)).toBeLessThanOrEqual(5);
  });
});

