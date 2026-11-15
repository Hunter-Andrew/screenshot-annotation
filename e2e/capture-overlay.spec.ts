import { expect, test, type Page } from "@playwright/test";

// The overlay window of monitor 1 in a real browser, with the in-memory fake bridge. The fake
// reports a 640x360 native frame; the viewport below is 320x180 CSS pixels (a 200% display), so
// a region dragged in CSS pixels must come out doubled.

interface Fake {
  __fakeBridge: { overlayOutcomes: unknown[]; readyOverlays: number[] };
}
const outcomes = (page: Page) => page.evaluate(() => (window as unknown as Fake).__fakeBridge.overlayOutcomes);

test.use({ viewport: { width: 320, height: 180 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/#overlay/1");
  const frozen = page.getByRole("img", { name: "Frozen screen" });
  await expect(frozen).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as Fake).__fakeBridge.readyOverlays)).toEqual([1]);
});

test("dragging a region shows its pixel size, dims the rest, and releasing captures it", async ({ page }) => {
  await page.mouse.move(20, 10);
  await page.mouse.down();
  await page.mouse.move(120, 70, { steps: 4 });
  await expect(page.getByText("200 × 120")).toBeVisible();
  await expect(page.getByTestId("guide-x")).toBeVisible();
  await page.mouse.up();

  await expect
    .poll(() => outcomes(page))
    .toEqual([{ kind: "region", monitor: 1, region: { x: 40, y: 20, width: 200, height: 120 } }]);
});

test("a drag that leaves the window stops at the monitor edge", async ({ page }) => {
  await page.mouse.move(300, 170);
  await page.mouse.down();
  await page.mouse.move(600, 400, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(() => outcomes(page))
    .toEqual([{ kind: "region", monitor: 1, region: { x: 600, y: 340, width: 40, height: 20 } }]);
});

test("M toggles the magnifier, Space takes the monitor, Esc cancels", async ({ page }) => {
  await page.mouse.move(100, 60);
  await page.keyboard.press("m");
  await expect(page.getByTestId("magnifier")).toBeVisible();
  await page.keyboard.press("m");
  await expect(page.getByTestId("magnifier")).toHaveCount(0);

  await page.keyboard.press("Space");
  await expect
    .poll(() => outcomes(page))
    .toEqual([{ kind: "monitor" }]);
});

test("Esc cancels", async ({ page }) => {
  await page.keyboard.press("Escape");
  await expect
    .poll(() => outcomes(page))
    .toEqual([{ kind: "cancel" }]);
});
