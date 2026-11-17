import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";
import { pattern } from "./blurPattern";
import { liveArea } from "./liveCanvas";

// The area outside the visible area (M4 polish B) on the real Fabric canvas with the fake bridge: no border at
// rest, the canvas margin measured around the area in Fit at several window sizes (and after a crop, and
// scrollable after a zoom), the outside darkness, the per-image "Show outside the canvas", and the visible area
// following the Annotations that grew it back in (Delete, Undo, an explicit Crop).

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  setCanvasMargin(value: number): Promise<void>;
  setOutsideDarkness(value: number): Promise<void>;
  setShowOutsideDefault(value: boolean): Promise<void>;
  copiedImages: Uint8Array[];
}
type InPage = { __fakeBridge: Bridge };

async function capture(page: Page, width: number, height: number) {
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) rgba.set([(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256, 255], (y * width + x) * 4);
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width, height },
  );
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
}

const stageBox = async (page: Page) => (await page.locator(".stage").boundingBox())!;
const areaBox = async (page: Page) => (await page.locator(".area").boundingBox())!;
const areaWidth = async (page: Page) => Math.round((await areaBox(page)).width);

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

const bridge = <K extends keyof Bridge>(page: Page, method: K, value: unknown) =>
  page.evaluate(([m, v]) => (window as unknown as { __fakeBridge: Record<string, (x: unknown) => Promise<void>> }).__fakeBridge[m as string]!(v), [method, value] as const);

/** Crop a 300 x 200 Capture (shown at 100%) to (100, 50) 150 x 100 with the Crop tool. */
async function cropMiddle(page: Page) {
  await page.getByRole("button", { name: "100%" }).click();
  await page.keyboard.press("c");
  const stage = await stageBox(page);
  await drag(page, { x: stage.x + 100, y: stage.y + 50 }, { x: stage.x + 250, y: stage.y + 150 });
  await expect.poll(() => areaWidth(page)).toBe(150);
}

const rgb = (pixel: number[]) => pixel.slice(0, 3);
const near = (actual: number[], expected: number[], tolerance = 2) => expected.forEach((v, k) => expect(Math.abs(actual[k]! - v)).toBeLessThanOrEqual(tolerance));
const DIM = [6, 8, 12];
const dimmed = (own: number[], percent: number) => own.slice(0, 3).map((c, k) => c * (1 - percent / 100) + DIM[k]! * (percent / 100));

test.use({ viewport: { width: 1000, height: 700 } });

test.describe("no border", () => {
  test("nothing is drawn around the visible area at rest, with the Crop tool on, or after a crop", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await cropMiddle(page);

    await expect(page.locator(".crop-frame")).toHaveCount(0);
    const area = page.locator(".area");
    expect(await area.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    expect(await area.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");

    // With the Crop tool's handles up too: just inside the edge the pixel is the Capture's own (not a white outline),
    // just outside it is the Capture dimmed. Sampled a quarter of the way along each edge, clear of the handles.
    await page.keyboard.press("c");
    const ownAt = (x: number, y: number) => pattern(100 + x, 50 + y);
    const inside = [
      { x: 37, y: 0, own: ownAt(37, 0) },
      { x: 0, y: 25, own: ownAt(0, 25) },
      { x: 37, y: 99, own: ownAt(37, 99) },
      { x: 149, y: 25, own: ownAt(149, 25) },
    ];
    for (const p of inside) expect((await liveArea(page, { x: p.x, y: p.y, w: 1, h: 1 }))!.data.slice(0, 3)).toEqual(rgb(p.own));
    const outside = (await liveArea(page, { x: 37, y: -1, w: 1, h: 1 }))!.data;
    near(outside, dimmed(pattern(137, 49), 60));
  });
});

test.describe("the margin around the visible area in Fit", () => {
  const sizes = [
    { width: 800, height: 600 },
    { width: 1000, height: 700 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
  ];
  const captures = [
    { width: 300, height: 200 },
    { width: 1600, height: 900 },
    { width: 3000, height: 400 },
  ];

  /** The gaps between the visible area and the Library strip, the tool column and the Style panel (and the top bar). */
  async function gaps(page: Page) {
    return page.evaluate(() => {
      const r = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const area = r(".area");
      const well = r(".well");
      return {
        left: area.left - r(".tools").right,
        right: r(".style-panel").left - area.right,
        top: area.top - well.top,
        bottom: r(".library-strip").top - area.bottom,
        scrolls: document.querySelector(".well")!.scrollWidth > document.querySelector(".well")!.clientWidth || document.querySelector(".well")!.scrollHeight > document.querySelector(".well")!.clientHeight,
      };
    });
  }

  for (const size of sizes) {
    for (const shot of captures) {
      test(`${size.width} x ${size.height} window, ${shot.width} x ${shot.height} Capture: at least 48 px on every side, equal left and right and top and bottom, also after a crop`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto("/");
        await capture(page, shot.width, shot.height);
        const check = async () => {
          // Fit settles after the view is measured.
          await expect
            .poll(async () => {
              const g = await gaps(page);
              return Math.min(g.left, g.right, g.top, g.bottom) >= 47 && !g.scrolls;
            })
            .toBe(true);
          const g = await gaps(page);
          expect(Math.abs(g.left - g.right)).toBeLessThanOrEqual(1.5);
          expect(Math.abs(g.top - g.bottom)).toBeLessThanOrEqual(1.5);
        };
        await check();

        // After a crop the area is fitted again with the same margin.
        await page.keyboard.press("c");
        const stage = await stageBox(page);
        await drag(page, { x: stage.x + stage.width * 0.2, y: stage.y + stage.height * 0.2 }, { x: stage.x + stage.width * 0.7, y: stage.y + stage.height * 0.8 });
        await expect(page.getByRole("button", { name: "Remove crop" })).toBeEnabled();
        await check();
      });
    }
  }

  test("the Canvas margin setting sets it, live: 100 px, and 16 px at the least", async ({ page }) => {
    await page.goto("/");
    await capture(page, 1600, 900);
    await bridge(page, "setCanvasMargin", 100);
    await expect.poll(async () => Math.min(...Object.values(await gaps(page)).filter((v): v is number => typeof v === "number"))).toBeGreaterThanOrEqual(99);
    // The side that limits the fit has exactly the setting; the other is centred.
    const g = await gaps(page);
    expect(Math.min(g.left, g.right, g.top, g.bottom)).toBeLessThanOrEqual(100.5);
    await bridge(page, "setCanvasMargin", 16);
    await expect.poll(async () => Math.min(...Object.values(await gaps(page)).filter((v): v is number => typeof v === "number"))).toBeLessThan(17.5);
  });

  test("after a manual zoom the whole quarter of margin around the area can be scrolled to", async ({ page }) => {
    await page.goto("/");
    await capture(page, 1600, 900);
    await page.getByRole("button", { name: "100%" }).click();
    const sides = () =>
      page.evaluate(() => {
        const well = document.querySelector<HTMLElement>(".well")!;
        well.scrollLeft = well.scrollWidth;
        well.scrollTop = well.scrollHeight;
        const area = document.querySelector(".area")!.getBoundingClientRect();
        const box = well.getBoundingClientRect();
        const afterRight = box.right - area.right - (well.offsetWidth - well.clientWidth);
        const afterBottom = box.bottom - area.bottom - (well.offsetHeight - well.clientHeight);
        well.scrollLeft = 0;
        well.scrollTop = 0;
        const area0 = document.querySelector(".area")!.getBoundingClientRect();
        return { left: area0.left - box.left, top: area0.top - box.top, right: afterRight, bottom: afterBottom };
      });
    await expect.poll(async () => (await sides()).left).toBeGreaterThanOrEqual(399);
    const s = await sides();
    expect(s.top).toBeGreaterThanOrEqual(224);
    expect(s.right).toBeGreaterThanOrEqual(399);
    expect(s.bottom).toBeGreaterThanOrEqual(224);
  });

  test("a drag can take the area's handle out into the margin, and a rectangle can be drawn out into it", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const before = await areaWidth(page);
    await page.keyboard.press("r");
    const stage = await stageBox(page);
    // 40 px past the right edge: inside the 48 px margin.
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });
    await expect.poll(() => areaWidth(page)).toBeGreaterThan(before + 30);
  });
});

test.describe("the outside darkness", () => {
  test("0 leaves the cropped-out Capture as captured, 95 makes it nearly black, and a change applies live", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await cropMiddle(page);
    // Capture (80, 70) is at (-20, 20) from the area's corner.
    const read = async () => (await liveArea(page, { x: -20, y: 20, w: 1, h: 1 }))!.data;

    near(await read(), dimmed(pattern(80, 70), 60));
    await bridge(page, "setOutsideDarkness", 0);
    await expect.poll(read).toEqual(pattern(80, 70));
    await bridge(page, "setOutsideDarkness", 95);
    await expect.poll(async () => Math.max(...(await read()).slice(0, 3))).toBeLessThan(30);
    near(await read(), dimmed(pattern(80, 70), 95));
    await bridge(page, "setOutsideDarkness", 30);
    near(await read(), dimmed(pattern(80, 70), 30));
    // The area itself is never dimmed.
    expect((await liveArea(page, { x: 10, y: 10, w: 1, h: 1 }))!.data).toEqual(pattern(110, 60));
  });
});

test.describe("Show outside the canvas", () => {
  /** A red rectangle whose left side lies in the Capture's cropped-out part: Capture x 58..62 at y 60..110. */
  async function drawRectThenCrop(page: Page) {
    await page.getByRole("button", { name: "100%" }).click();
    await page.keyboard.press("r");
    const stage = await stageBox(page);
    await drag(page, { x: stage.x + 60, y: stage.y + 60 }, { x: stage.x + 160, y: stage.y + 110 });
    await page.keyboard.press("c");
    await drag(page, { x: stage.x + 100, y: stage.y + 50 }, { x: stage.x + 250, y: stage.y + 150 });
    await expect.poll(() => areaWidth(page)).toBe(150);
    await page.keyboard.press("c"); // the Image section shows with the Crop tool
  }
  const toggle = (page: Page) => page.getByRole("checkbox", { name: "Show outside the canvas" });

  test("on (the default) the outside shows dimmed, Annotations included; off it shows only the dark fill, and Undo brings it back", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await drawRectThenCrop(page);
    await expect(toggle(page)).toBeChecked();

    // The rectangle's left side is outside the area: Capture x 60, y 80 is at (-40, 30) from the area's corner.
    const rect = async () => (await liveArea(page, { x: -40, y: 30, w: 1, h: 1 }))!.data;
    const capturePixel = async () => (await liveArea(page, { x: -20, y: 20, w: 1, h: 1 }))!.data;
    const onRect = await rect();
    expect(onRect[3]).toBe(255);
    near(onRect, dimmed([224, 36, 36], 60));
    expect((await capturePixel())[3]).toBe(255);

    await toggle(page).uncheck();
    await expect.poll(async () => (await rect())[3]).toBe(0);
    expect((await capturePixel())[3]).toBe(0);
    // The visible area is untouched, and Copy is the same either way (the outside never reaches an Export).
    expect((await liveArea(page, { x: 10, y: 20, w: 1, h: 1 }))!.data).toEqual(pattern(110, 70));
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
    const copied = decodePixels(Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!))));
    expect([copied.width, copied.height]).toEqual([150, 100]);

    await page.keyboard.press("Control+z");
    await expect(toggle(page)).toBeChecked();
    await expect.poll(async () => (await rect())[3]).toBe(255);
  });

  test("a new image takes the Settings default", async ({ page }) => {
    await page.goto("/");
    await bridge(page, "setShowOutsideDefault", false);
    await capture(page, 300, 200);
    await page.keyboard.press("c");
    await expect(toggle(page)).not.toBeChecked();
    await cropMiddle(page);
    expect((await liveArea(page, { x: -20, y: 20, w: 1, h: 1 }))!.data[3]).toBe(0);
  });
});

test.describe("the area follows the Annotations that grew it", () => {
  const copiedSize = async (page: Page) => {
    const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(before + 1);
    const px = decodePixels(Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!))));
    return [px.width, px.height];
  };

  test("a rectangle drawn past the edge grows it; Delete takes it back to the Capture, and Undo and Redo follow", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);
    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });
    await expect.poll(() => areaWidth(page)).toBeGreaterThan(330);
    const grown = (await copiedSize(page))[0]!;
    expect(grown).toBeGreaterThan(330);

    await page.keyboard.press("Delete");
    await expect.poll(() => areaWidth(page)).toBe(300);
    expect(await copiedSize(page)).toEqual([300, 200]);

    await page.keyboard.press("Control+z"); // the rectangle and the growth come back together
    await expect.poll(() => areaWidth(page)).toBe(grown);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(() => areaWidth(page)).toBe(300);
  });

  test("an explicit Crop after growth is final: deleting the rectangle then leaves the area as set", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    let stage = await stageBox(page);
    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });
    await expect.poll(() => areaWidth(page)).toBeGreaterThan(330);
    const grown = await areaWidth(page);

    // Set the area explicitly, to the whole of the grown area (a fresh rectangle).
    await page.keyboard.press("c");
    const area = await areaBox(page);
    await drag(page, { x: area.x + 1, y: area.y + 1 }, { x: area.x + area.width - 1, y: area.y + area.height - 1 });
    await expect.poll(() => areaWidth(page)).toBeGreaterThan(grown - 6);

    stage = await stageBox(page);
    await page.mouse.click(stage.x + 270, stage.y + 50); // the rectangle's top edge
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await page.evaluate(() => document.querySelectorAll(".canvas-container").length))).toBe(1);
    expect(await areaWidth(page)).toBeGreaterThan(grown - 6);
  });
});
