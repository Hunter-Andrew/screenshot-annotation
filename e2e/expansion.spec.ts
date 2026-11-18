import { expect, type Page, test } from "@playwright/test";
import { legacyMargins } from "./sameCropMargin";

legacyMargins(test);
import { decodePixels, hasChunk } from "../src/core/testing";
import { at, averageOf, nearly, pattern } from "./blurPattern";
import { liveArea } from "./liveCanvas";

// Canvas expansion and the per-image background (ticket 37) on the real Fabric canvas with the fake bridge:
// an Annotation drawn or moved past the Capture's edge grows the image, the Crop tool's handles expand and
// crop, Fit re-fits after a change (not during a drag) and a manual zoom stays, and Copy and the Library file
// carry the grown area with its background (or alpha). The Capture inside the file is never altered.

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  setImageBackground(value: string): Promise<void>;
  setCheckerboard(value: string): Promise<void>;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

/** A Capture in which every pixel differs (blurPattern.ts), shown at 100% when the well is big enough. */
async function capture(page: Page, width: number, height: number) {
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
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
}

const stageBox = async (page: Page) => (await page.locator(".stage").boundingBox())!;

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

/** Copy, and what was put on the clipboard, decoded. */
async function copied(page: Page) {
  const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(before + 1);
  const bytes = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!)));
  return { png: bytes, px: decodePixels(bytes) };
}

/** The newest Library file as the next start would read it. */
const libraryFile = (page: Page) =>
  page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const { readSize } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1)!;
    const decoded = decodeLibraryPng(file.bytes);
    let sum = 0;
    for (const byte of decoded.capture as Uint8Array) sum = (sum * 31 + byte) >>> 0;
    const visible = readSize(file.bytes);
    return { crop: decoded.model.crop, background: decoded.model.background, capture: sum, visible: [visible.width, visible.height] };
  });

const setSetting = (page: Page, name: "setImageBackground" | "setCheckerboard", value: string) =>
  page.evaluate(([n, v]) => (window as unknown as InPage).__fakeBridge[n as "setImageBackground"](v as string), [name, value] as const);

const WHITE = [255, 255, 255, 255];
const DARK = [0x19, 0x19, 0x19, 255]; // the Dark image background setting's default, #191919
const zoomLevel = (page: Page) => page.getByLabel("Zoom level").textContent();

// Big enough for a 300 x 200 Capture to be at 100% with its whole dark margin on screen.
test.use({ viewport: { width: 1000, height: 700 } });

test.describe("an Annotation past the Capture's edge", () => {
  test("drawing a rectangle out into the margin grows the image; Copy is bigger, white outside the Capture, and one Undo takes it all back", async ({ page }) => {
    await page.goto("/");
    await setSetting(page, "setImageBackground", "white");
    await capture(page, 300, 200);
    const original = await libraryFile(page);
    const stage = await stageBox(page);

    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });

    // Width grew to include the rectangle and its 4 px outline; the height did not change.
    const grown = await copied(page);
    expect(Math.abs(grown.px.width - 342)).toBeLessThanOrEqual(2);
    expect(grown.px.height).toBe(200);
    expect(hasChunk(grown.png, "snAP")).toBe(false);
    expect(hasChunk(grown.png, "snIM")).toBe(false);
    // The Capture is as captured, and the area the rectangle grew into is the background (not the outline).
    expect(Array.from(at(grown.px, 10, 10))).toEqual(pattern(10, 10));
    expect(Array.from(at(grown.px, 320, 190))).toEqual(WHITE);
    expect(Array.from(at(grown.px, 305, 5))).toEqual(WHITE);

    // The Library file's visible pixels are the finished image; the Capture inside it is untouched.
    await expect.poll(async () => (await libraryFile(page)).crop, { timeout: 6000, intervals: [200] }).not.toBeNull();
    const file = await libraryFile(page);
    expect(file.background).toBe("white");
    expect(file.visible).toEqual([grown.px.width, 200]);
    expect(file.capture).toEqual(original.capture);

    // The rectangle and the growth are one step.
    await page.keyboard.press("Control+z");
    const back = await copied(page);
    expect([back.px.width, back.px.height]).toEqual([300, 200]);
    await expect.poll(async () => (await libraryFile(page)).crop, { timeout: 6000, intervals: [200] }).toBeNull();
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("moving a rectangle left and up past the edge grows the image up and to the left, in one undo step", async ({ page }) => {
    await page.goto("/");
    await setSetting(page, "setImageBackground", "dark");
    await capture(page, 300, 200);
    const stage = await stageBox(page);

    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 60, y: stage.y + 60 }, { x: stage.x + 140, y: stage.y + 120 });
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    // Grab it by its outline (a fill-less rectangle is grabbed on the stroke) and move it 70 px left and 70 up:
    // it then reaches 10 px past the left edge and 10 past the top (plus its 2 px of outline).
    const grab = { x: stage.x + 75, y: stage.y + 60 }; // clear of the handle in the middle of the top edge
    await drag(page, grab, { x: grab.x - 70, y: grab.y - 70 });

    const moved = await copied(page);
    expect(Math.abs(moved.px.width - 312)).toBeLessThanOrEqual(3);
    expect(Math.abs(moved.px.height - 212)).toBeLessThanOrEqual(3);
    // The Capture sits where it was inside the grown image; the new top-left corner is the dark background.
    const dx = moved.px.width - 300;
    const dy = moved.px.height - 200;
    expect(Array.from(at(moved.px, dx + 10, dy + 10))).toEqual(pattern(10, 10));
    expect(Array.from(at(moved.px, 1, moved.px.height - 1))).toEqual(DARK);

    await page.keyboard.press("Control+z"); // the move and its growth together
    const undone = await copied(page);
    expect([undone.px.width, undone.px.height]).toEqual([300, 200]);
    await page.keyboard.press("Control+z"); // the drawing
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("a Transparent background leaves alpha 0 outside the Capture; the Capture's own pixels stay opaque", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);

    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });

    const out = await copied(page);
    expect(Array.from(at(out.px, 330, 190))).toEqual([0, 0, 0, 0]);
    expect(Array.from(at(out.px, 10, 10))).toEqual(pattern(10, 10));
    await expect.poll(async () => (await libraryFile(page)).background).toBe("transparent");
  });

  test("a Blur drawn across the Capture's edge does not grow the image: it pixelates the Capture and the background beneath it, clipped at the edge", async ({ page }) => {
    await page.goto("/");
    await setSetting(page, "setImageBackground", "white");
    await capture(page, 300, 200);
    const stage = await stageBox(page);

    await page.keyboard.press("b");
    await page.getByLabel("Block size").fill("16");
    await drag(page, { x: stage.x + 240, y: stage.y + 60 }, { x: stage.x + 336, y: stage.y + 124 });

    const out = await copied(page);
    expect(out.px.width).toBe(300); // a Blur never grows the area
    expect(out.px.height).toBe(200);
    const colorAt = (x: number, y: number) => (x < 300 ? pattern(x, y) : WHITE);
    // Blocks run 16 px from the box's corner at (240, 60).
    nearly(Array.from(at(out.px, 245, 65)), averageOf(240, 60, 256, 76)); // wholly over the Capture
    nearly(Array.from(at(out.px, 295, 65)), averageOf(288, 60, 300, 76, colorAt)); // the last block is cut at the edge: it averages what is visible
    expect(Array.from(at(out.px, 239, 65))).toEqual(pattern(239, 65)); // outside the box: untouched
  });
});

test.describe("Pen, Highlighter and Blur never grow the area", () => {
  /** What is saved with the image now: its area and its Annotations. */
  const saved = (page: Page) =>
    page.evaluate(async () => {
      const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
      const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1)!;
      const { model } = decodeLibraryPng(file.bytes);
      const annotations = model.annotations as { type: string; points?: { x: number }[] }[];
      const maxX = Math.max(...annotations.flatMap((a) => (a.points ?? []).map((p) => p.x)));
      return { crop: model.crop ?? null, kinds: annotations.map((a) => a.type), maxX };
    });

  for (const [name, key] of [["Pen", "p"], ["Highlighter", "h"], ["Blur", "b"]] as const) {
    test(`a ${name} dragged past the edge keeps the area and is kept whole; Copy is as big as the Capture`, async ({ page }) => {
      await page.goto("/");
      await setSetting(page, "setImageBackground", "white");
      await capture(page, 300, 200);
      const stage = await stageBox(page);

      await page.keyboard.press(key);
      await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 380, y: stage.y + 120 });
      await expect.poll(async () => (await saved(page)).kinds.length, { timeout: 10_000 }).toBe(1);
      const file = await saved(page);
      expect(file.crop).toBeNull();
      const out = await copied(page);
      expect([out.px.width, out.px.height]).toEqual([300, 200]);

      // The stroke or box is still one step: Undo removes it, Redo brings it back, never any growth.
      await page.keyboard.press("Control+z");
      await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
      await page.keyboard.press("Control+Shift+z");
      await expect.poll(async () => (await saved(page)).kinds.length, { timeout: 10_000 }).toBe(1);
      expect((await saved(page)).crop).toBeNull();
    });
  }

  test("moving a Pen stroke past the edge does not grow the area, and a rectangle beside it still does and shrinks back", async ({ page }) => {
    await page.goto("/");
    await setSetting(page, "setImageBackground", "white");
    await capture(page, 300, 200);
    const stage = await stageBox(page);

    await page.keyboard.press("p");
    await drag(page, { x: stage.x + 100, y: stage.y + 150 }, { x: stage.x + 180, y: stage.y + 150 });
    await page.keyboard.press("v");
    await drag(page, { x: stage.x + 140, y: stage.y + 150 }, { x: stage.x + 340, y: stage.y + 150 }); // the stroke now reaches past the right edge
    await expect.poll(async () => (await saved(page)).kinds, { timeout: 10_000 }).toEqual(["pen"]);
    await expect.poll(async () => (await saved(page)).maxX, { timeout: 10_000 }).toBeGreaterThan(300); // it really is past the edge
    expect((await copied(page)).px.width).toBe(300);
    expect((await saved(page)).crop).toBeNull();

    // A rectangle past the edge grows the area; deleting it takes the area back, the pen stays.
    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 30 }, { x: stage.x + 360, y: stage.y + 80 });
    expect((await copied(page)).px.width).toBeGreaterThan(340);
    await page.keyboard.press("Delete");
    expect((await copied(page)).px.width).toBe(300);
    await expect.poll(async () => (await saved(page)).kinds, { timeout: 10_000 }).toEqual(["pen"]);
  });

  test("what lies outside stays in the Annotation: widening the area with the Crop tool shows it again", async ({ page }) => {
    await page.goto("/");
    await setSetting(page, "setImageBackground", "white");
    await capture(page, 300, 200);
    const stage = await stageBox(page);

    await page.keyboard.press("p");
    await drag(page, { x: stage.x + 200, y: stage.y + 100 }, { x: stage.x + 360, y: stage.y + 100 });
    expect((await copied(page)).px.width).toBe(300);
    const redInside = (px: ReturnType<typeof decodePixels>, x0: number, x1: number) => {
      let n = 0;
      for (let y = 90; y < 110; y++) for (let x = x0; x < x1; x++) n += at(px, x, y)[0] === 224 && at(px, x, y)[1] === 36 ? 1 : 0;
      return n;
    };
    expect(redInside((await copied(page)).px, 200, 300)).toBeGreaterThan(100);

    // Widen the area to the right with the Crop tool's handle.
    await page.keyboard.press("c");
    await drag(page, { x: stage.x + 300, y: stage.y + 100 }, { x: stage.x + 380, y: stage.y + 100 });
    const wide = await copied(page);
    expect(wide.px.width).toBeGreaterThan(370);
    expect(redInside(wide.px, 310, 360)).toBeGreaterThan(100); // the part that was clipped is there
  });
});

test.describe("the Crop tool's handles", () => {
  test("drag a handle outward to expand, inward to crop; one step each; Undo walks back", async ({ page }) => {
    await page.goto("/");
    await setSetting(page, "setImageBackground", "white");
    await capture(page, 300, 200);
    const stage = await stageBox(page);

    await page.keyboard.press("c");
    // The right-middle handle sits on the middle of the right edge: drag it 40 px outward (the margin is 48 px).
    await drag(page, { x: stage.x + 300, y: stage.y + 100 }, { x: stage.x + 340, y: stage.y + 100 });
    await expect(page.getByRole("button", { name: /^Crop/ })).toHaveAttribute("aria-pressed", "true"); // still fine-tuning
    // (The handle is grabbed a few pixels off its edge, so sizes are to within a few pixels.)
    let out = await copied(page);
    const wide = out.px.width;
    expect(Math.abs(wide - 340)).toBeLessThanOrEqual(5);
    expect(out.px.height).toBe(200);
    expect(Array.from(at(out.px, 320, 100))).toEqual(WHITE);

    // The left-middle handle moves in by 100 px: a Crop of the expanded image.
    const area = (await page.locator(".area").boundingBox())!; // the grown image was centred again
    await drag(page, { x: area.x, y: area.y + 100 }, { x: area.x + 100, y: area.y + 100 });
    out = await copied(page);
    expect(Math.abs(wide - out.px.width - 100)).toBeLessThanOrEqual(5);
    await expect.poll(async () => (await libraryFile(page)).crop?.x, { timeout: 6000, intervals: [200] }).toBeGreaterThan(90);
    const cut = (await libraryFile(page)).crop!;
    expect(cut.x).toBeLessThan(110);
    expect(Array.from(at(out.px, 5, 5))).toEqual(pattern(cut.x + 5, 5)); // the Capture's column `cut.x` is now the first

    await page.keyboard.press("Control+z");
    expect((await copied(page)).px.width).toBe(wide);
    await page.keyboard.press("Control+z");
    expect(await copied(page).then((c) => [c.px.width, c.px.height])).toEqual([300, 200]);
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("a fresh rectangle drawn from the margin out over the Capture and past its edges expands the image", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);

    await page.keyboard.press("c");
    await drag(page, { x: stage.x - 20, y: stage.y - 15 }, { x: stage.x + 320, y: stage.y + 210 });

    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    const out = await copied(page);
    expect(Math.abs(out.px.width - 340)).toBeLessThanOrEqual(3);
    expect(Math.abs(out.px.height - 225)).toBeLessThanOrEqual(3);
    expect(Array.from(at(out.px, 2, 2))).toEqual([0, 0, 0, 0]);
    const file = await libraryFile(page);
    expect(file.capture).toBeGreaterThan(0);
  });
});

test.describe("the view", () => {
  test("Fit re-fits after a handle drag is released, not during it; a manual zoom then stays put", async ({ page }) => {
    await page.goto("/");
    await capture(page, 800, 300);
    const level = async () => Number.parseInt((await zoomLevel(page))!, 10);
    const fitted = await level();
    expect(fitted).toBeLessThan(100);
    const areaBox = async () => (await page.locator(".area").boundingBox())!;
    const wellBox = async () => (await page.locator(".well").boundingBox())!;

    await page.keyboard.press("c");
    const box = await areaBox();
    await page.mouse.move(box.x + box.width, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2, { steps: 6 });
    // Mid-drag nothing has been committed: the view has not moved.
    expect(await level()).toBe(fitted);
    expect((await areaBox()).width).toBeCloseTo(box.width, 0);
    await page.mouse.up();

    // Released: the grown area is what Fit fits, so the zoom drops and the area fills the well again.
    await expect.poll(level).toBeLessThan(fitted);
    const well = await wellBox();
    await expect.poll(async () => (await areaBox()).x + (await areaBox()).width).toBeLessThanOrEqual(well.x + well.width);
    const refitted = await areaBox();
    expect(refitted.width).toBeGreaterThan(well.width * 0.6);
    // Nothing to scroll in Fit.
    expect(await page.locator(".well").evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);

    // After a manual zoom the zoom never moves on its own, even when the image grows again.
    await page.getByRole("button", { name: "100%" }).click();
    await expect(page.getByLabel("Zoom level")).toHaveText("100%");
    await page.keyboard.press("r");
    const stage = await stageBox(page);
    await page.locator(".well").evaluate((el) => (el.scrollLeft = 0));
    const stage2 = await stageBox(page);
    await drag(page, { x: stage2.x + 100, y: stage2.y + 100 }, { x: stage2.x + 200, y: stage2.y + 150 });
    await expect(page.getByLabel("Zoom level")).toHaveText("100%");
    expect(stage.width).toBe(800);
  });

  test("everything the canvas draws outside the visible area is dimmed (95% by default); the area itself is as captured", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await page.getByRole("button", { name: "100%" }).click();

    // Crop it to a part, so the rest of the Capture lies outside the visible area too.
    await page.keyboard.press("c");
    const stage = await stageBox(page);
    await drag(page, { x: stage.x + 100, y: stage.y + 50 }, { x: stage.x + 250, y: stage.y + 150 });
    await expect.poll(async () => Math.round((await page.locator(".area").boundingBox())!.width)).toBe(150);

    const inside = (await liveArea(page, { x: 10, y: 10, w: 1, h: 1 }))!.data;
    expect(inside).toEqual(pattern(110, 60));
    // The cropped-out Capture is at area (-20, 20) = Capture (80, 70): 5% of its own colour plus 95% of the dim.
    const outside = await liveArea(page, { x: -20, y: 20, w: 1, h: 1 });
    const own = pattern(80, 70);
    const dim = [6, 8, 12];
    [0, 1, 2].forEach((k) => expect(Math.abs(outside!.data[k]! - (own[k]! * 0.05 + dim[k]! * 0.95))).toBeLessThanOrEqual(2));
    expect(outside!.data[3]).toBe(255);
    // The margin is not painted by the canvas at all: it is the well's own dark fill.
    expect((await liveArea(page, { x: -120, y: 0, w: 1, h: 1 }))!.data[3]).toBe(0);
  });

  test("Transparent is shown on a checkerboard that is Dark or Light as Settings say, and never reaches the Export", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);
    await page.keyboard.press("c");
    await drag(page, { x: stage.x + 300, y: stage.y + 100 }, { x: stage.x + 380, y: stage.y + 100 });

    const checker = page.locator(".area .checker");
    await expect(checker).toBeVisible();
    const colour = () => checker.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await colour()).toBe("rgb(255, 255, 255)");
    expect(await checker.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("conic-gradient");

    await setSetting(page, "setCheckerboard", "dark");
    await expect.poll(colour).toBe("rgb(43, 47, 58)");

    // The picture itself is transparent there, not checkered.
    const out = await copied(page);
    expect(Array.from(at(out.px, out.px.width - 5, 100))).toEqual([0, 0, 0, 0]);
  });

  test("the Image section's White, Dark and Transparent change the area outside the Capture at once", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const stage = await stageBox(page);
    await page.keyboard.press("c");
    await drag(page, { x: stage.x + 300, y: stage.y + 100 }, { x: stage.x + 380, y: stage.y + 100 });

    const section = page.getByRole("region", { name: "Image" });
    await section.getByRole("radio", { name: "Dark" }).click();
    let out = await copied(page);
    expect(Array.from(at(out.px, out.px.width - 5, 100))).toEqual(DARK);
    await expect(page.locator(".area .checker")).toHaveCount(0);

    await section.getByRole("radio", { name: "White" }).click();
    out = await copied(page);
    expect(Array.from(at(out.px, out.px.width - 5, 100))).toEqual(WHITE);

    await page.keyboard.press("Control+z"); // the background is a step of its own
    out = await copied(page);
    expect(Array.from(at(out.px, out.px.width - 5, 100))).toEqual(DARK);
    await expect.poll(async () => (await libraryFile(page)).background).toBe("dark");
  });

  test("the Library strip draws the checkerboard behind a thumbnail", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const thumb = page.locator(".lib-thumb img").first();
    await expect(thumb).toBeVisible();
    expect(await thumb.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("conic-gradient");
  });
});
