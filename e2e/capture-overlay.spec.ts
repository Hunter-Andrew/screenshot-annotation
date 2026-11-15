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

test("the magnifier is on for a fresh install; M turns it off and the next overlay remembers", async ({ page }) => {
  await page.mouse.move(100, 60);
  await expect(page.getByTestId("magnifier")).toBeVisible(); // no key press needed

  await page.keyboard.press("m");
  await expect(page.getByTestId("magnifier")).toHaveCount(0);

  // The next capture opens a new overlay window: it starts in the stored state (off).
  await page.reload();
  await expect(page.getByRole("img", { name: "Frozen screen" })).toBeVisible();
  await page.mouse.move(100, 60);
  await page.mouse.move(101, 61);
  await expect(page.getByTestId("guide-x")).toBeVisible();
  await expect(page.getByTestId("magnifier")).toHaveCount(0);

  await page.keyboard.press("M");
  await expect(page.getByTestId("magnifier")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "Frozen screen" })).toBeVisible();
  await page.mouse.move(100, 60);
  await page.mouse.move(101, 61);
  await expect(page.getByTestId("magnifier")).toBeVisible();
});

test("the Settings checkbox and the overlay share the stored magnifier value", async ({ page }) => {
  await page.goto("/#settings"); // the beforeEach page is the overlay; a hash change alone does not re-route
  await page.reload();
  const box = page.getByRole("checkbox", { name: "Show the magnifier in the capture overlay" });
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.goto("/#overlay/1");
  await page.reload();
  await expect(page.getByRole("img", { name: "Frozen screen" })).toBeVisible();
  await page.mouse.move(100, 60);
  await page.mouse.move(101, 61);
  await expect(page.getByTestId("guide-x")).toBeVisible();
  await expect(page.getByTestId("magnifier")).toHaveCount(0);
  await page.keyboard.press("m"); // back on from the overlay
  await page.goto("/#settings");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Show the magnifier in the capture overlay" })).toBeChecked();
});

test("Space takes the monitor", async ({ page }) => {
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

test.describe("window mode", () => {
  // Native pixels on the 640x360 frame (CSS x2): a dialog over a big window.
  const windows = {
    1: [
      { x: 300, y: 100, width: 200, height: 100 }, // CSS 150,50 100x50
      { x: 100, y: 40, width: 400, height: 280 }, // CSS 50,20 200x140
    ],
  };
  const url = `/?overlayWindows=${encodeURIComponent(JSON.stringify(windows))}#overlay/1`;

  test.beforeEach(async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole("img", { name: "Frozen screen" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as Fake).__fakeBridge.readyOverlays)).toEqual([1]);
  });

  test("hovering highlights the window under the pointer and a click captures it", async ({ page }) => {
    await page.mouse.move(60, 30); // only the big window
    const highlight = page.getByTestId("window-highlight");
    await expect(highlight).toBeVisible();
    await expect(page.getByText("400 × 280")).toBeVisible();

    await page.mouse.move(200, 70); // the dialog is on top here
    await expect(page.getByText("200 × 100")).toBeVisible();
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => outcomes(page)).toEqual([{ kind: "window", monitor: 1, window: 0 }]);
  });

  test("no highlight over the bare desktop, and a click there captures nothing", async ({ page }) => {
    await page.mouse.move(310, 170);
    await expect(page.getByTestId("window-highlight")).toHaveCount(0);
    await page.mouse.down();
    await page.mouse.up();
    expect(await outcomes(page)).toEqual([]);
  });
});
