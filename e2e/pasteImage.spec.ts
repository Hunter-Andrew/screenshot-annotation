import { expect, type Page, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";
import { at, averageOf, nearly, pattern } from "./blurPattern";

// Pasted images (ticket 38) in real Chromium with the real Fabric canvas and the fake platform bridge.
// Expected pixels are worked out here by hand from known colours, not by the renderer's code.

const W = 300;
const H = 200;
const BLUE = [0, 0, 255, 255];
const GREEN = [0, 255, 0, 255];
// The pasted picture: 40 x 30, its left half blue and its right half green.
const IMG_W = 40;
const IMG_H = 30;
const pictureAt = (x: number) => (x < IMG_W / 2 ? BLUE : GREEN);

async function exportOf(page: Page, annotations: unknown[], opts: { alpha?: number } = {}): Promise<Uint8Array> {
  const png = await page.evaluate(
    async ({ annotations, W, H, IMG_W, IMG_H, alpha }) => {
      const { exportPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
      const { renderFinished } = await import(/* @vite-ignore */ "/src/canvas/renderFinished.ts" as string);
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const rgba = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) rgba.set([(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256, 255], (y * W + x) * 4);
      const capture = encodeRgbaPng(W, H, rgba);
      const pic = new Uint8Array(IMG_W * IMG_H * 4);
      for (let y = 0; y < IMG_H; y++)
        for (let x = 0; x < IMG_W; x++) pic.set(x < IMG_W / 2 ? [0, 0, 255, alpha] : [0, 255, 0, alpha], (y * IMG_W + x) * 4);
      const img = encodeRgbaPng(IMG_W, IMG_H, pic);
      const out = await exportPng(
        { capture, model: { formatVersion: 2, annotations, crop: null }, images: { pic: img } },
        renderFinished,
      );
      return Array.from(out as Uint8Array);
    },
    { annotations, W, H, IMG_W, IMG_H, alpha: opts.alpha ?? 255 },
  );
  return Uint8Array.from(png);
}

const image = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  type: "image",
  imageId: "pic",
  x: 50,
  y: 30,
  width: IMG_W,
  height: IMG_H,
  border: { enabled: false, color: "#ff0000", width: 4 },
  opacity: { value: 1 },
  ...over,
});

test.describe("the Export of a pasted image", () => {
  test("draws the picture's own pixels in its box, touches nothing else, and carries no chunk", async ({ page }) => {
    await page.goto("/");
    const png = await exportOf(page, [image()]);
    expect(hasChunk(png, "snAP")).toBe(false);
    expect(hasChunk(png, "snIM")).toBe(false);
    const out = decodePixels(png);
    expect([out.width, out.height]).toEqual([W, H]);
    for (const [x, y] of [[50, 30], [69, 30], [70, 45], [89, 59], [60, 50], [80, 40]] as const) {
      expect(at(out, x, y), `at ${x},${y}`).toEqual(pictureAt(x - 50));
    }
    for (const [x, y] of [[49, 40], [90, 40], [60, 29], [60, 60], [0, 0], [299, 199]] as const) {
      expect(at(out, x, y), `at ${x},${y}`).toEqual(pattern(x, y));
    }
  });

  test("stretches to the box it is given (a resize), keeping the halves", async ({ page }) => {
    await page.goto("/");
    const out = decodePixels(await exportOf(page, [image({ width: 80, height: 60 })]));
    expect(at(out, 60, 50)).toEqual(BLUE); // inside the left half
    expect(at(out, 120, 80)).toEqual(GREEN); // inside the right half
    expect(at(out, 131, 80)).toEqual(pattern(131, 80));
    expect(at(out, 120, 91)).toEqual(pattern(120, 91));
  });

  test("with a border draws it inside the edge: same footprint, picture pixels inside it", async ({ page }) => {
    await page.goto("/");
    const out = decodePixels(await exportOf(page, [image({ border: { enabled: true, color: "#ff0000", width: 4 } })]));
    const RED = [255, 0, 0, 255];
    for (const [x, y] of [[50, 30], [53, 45], [86, 45], [89, 45], [60, 30], [60, 33], [60, 56], [60, 59]] as const) {
      expect(at(out, x, y), `border at ${x},${y}`).toEqual(RED);
    }
    for (const [x, y] of [[54, 45], [85, 45], [60, 34], [60, 55]] as const) {
      expect(at(out, x, y), `picture at ${x},${y}`).toEqual(pictureAt(x - 50));
    }
    // The footprint did not grow: just outside is the Capture.
    for (const [x, y] of [[49, 45], [90, 45], [60, 29], [60, 60]] as const) expect(at(out, x, y)).toEqual(pattern(x, y));
  });

  test("a border off draws nothing extra, whatever its color and width say", async ({ page }) => {
    await page.goto("/");
    const out = decodePixels(await exportOf(page, [image({ border: { enabled: false, color: "#ff0000", width: 12 } })]));
    expect(at(out, 50, 30)).toEqual(BLUE);
  });

  test("opacity fades the picture over what is beneath it, not the border", async ({ page }) => {
    await page.goto("/");
    const out = decodePixels(
      await exportOf(page, [image({ opacity: { value: 0.5 }, border: { enabled: true, color: "#ff0000", width: 4 } })]),
    );
    // Picture pixel at (60, 45): half blue over the Capture there.
    const cap = pattern(60, 45);
    nearly(Array.from(at(out, 60, 45)), [cap[0]! / 2, cap[1]! / 2, (cap[2]! + 255) / 2, 255]);
    // The border stays fully opaque.
    expect(at(out, 60, 31)).toEqual([255, 0, 0, 255]);
  });

  test("keeps the picture's own transparency and multiplies it with the opacity", async ({ page }) => {
    await page.goto("/");
    // Alpha 128 (about 0.5) at opacity 50%: the picture contributes about a quarter.
    const out = decodePixels(await exportOf(page, [image({ opacity: { value: 0.5 } })], { alpha: 128 }));
    const cap = pattern(60, 45);
    const a = (128 / 255) * 0.5;
    nearly(Array.from(at(out, 60, 45)), [cap[0]! * (1 - a), cap[1]! * (1 - a), cap[2]! * (1 - a) + 255 * a, 255]);
  });

  test("a pasted image beneath a Blur is pixelated, as it looks composited (opacity included)", async ({ page }) => {
    await page.goto("/");
    // The picture at 50% opacity under a Blur whose 16 px blocks start on the picture's corner.
    const pic = image({ x: 48, y: 32, width: 32, height: 32, opacity: { value: 0.5 } });
    const blur = { id: "b1", type: "blur", x: 48, y: 32, width: 48, height: 32, strength: { blockSize: 16 } };
    const out = decodePixels(await exportOf(page, [pic, blur]));
    // What is under the Blur: the Capture, with the picture (half blue / half green, at 50%) over its left 32 px.
    const composited = (x: number, y: number) => {
      const cap = pattern(x, y);
      if (x < 48 || x >= 80 || y < 32 || y >= 64) return cap;
      const color = x - 48 < IMG_W / 2 ? BLUE : GREEN;
      return [0, 1, 2, 3].map((k) => (k === 3 ? 255 : (cap[k]! + color[k]!) / 2));
    };
    // The picture is stretched to 32 px wide: its halves meet at x = 64, which is a block edge.
    for (const [bx, by] of [[48, 32], [64, 32], [48, 48], [64, 48]] as const) {
      const expected = averageOf(bx, by, bx + 16, by + 16, composited);
      for (const [dx, dy] of [[0, 0], [15, 0], [0, 15], [15, 15], [7, 9]] as const) nearly(Array.from(at(out, bx + dx, by + dy)), expected);
    }
    // Not the bare Capture's average: the picture really was under the Blur.
    const bare = averageOf(48, 32, 64, 48);
    expect(Math.abs(at(out, 55, 40)[2]! - bare[2]!)).toBeGreaterThan(20);
    // A pasted image above the Blur is not pixelated.
    const above = decodePixels(await exportOf(page, [blur, pic]));
    nearly(Array.from(at(above, 52, 40)), [pattern(52, 40)[0]! / 2, pattern(52, 40)[1]! / 2, (pattern(52, 40)[2]! + 255) / 2, 255]);
  });
});

// --- in the editor ---------------------------------------------------------------------------------

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

async function captureWithPattern(page: Page, width: number, height: number, capturedAt = new Date()) {
  await page.evaluate(
    ({ width, height, at }) => {
      const rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) rgba.set([(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256, 255], (y * width + x) * 4);
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date(at) });
    },
    { width, height, at: capturedAt.getTime() },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
}

/** Ctrl+V with a PNG of the picture on the clipboard (and optionally some text too). */
async function pasteClipboard(page: Page, opts: { text?: string; picture?: boolean; focus?: string } = {}) {
  await page.evaluate(
    async ({ opts, IMG_W, IMG_H }) => {
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const data = new DataTransfer();
      if (opts.picture !== false) {
        const rgba = new Uint8Array(IMG_W * IMG_H * 4);
        for (let y = 0; y < IMG_H; y++)
          for (let x = 0; x < IMG_W; x++) rgba.set(x < IMG_W / 2 ? [0, 0, 255, 255] : [0, 255, 0, 255], (y * IMG_W + x) * 4);
        const bytes = encodeRgbaPng(IMG_W, IMG_H, rgba);
        data.items.add(new File([bytes as BlobPart], "image.png", { type: "image/png" }));
      }
      if (opts.text) data.setData("text/plain", opts.text);
      const target = opts.focus ? document.querySelector<HTMLElement>(opts.focus)! : document.body;
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    },
    { opts, IMG_W, IMG_H },
  );
}

interface SavedImage {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageId: string;
  border: { enabled: boolean; color: string; width: number };
  opacity: { value: number };
}
async function savedImages(page: Page): Promise<SavedImage[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    if (!file) return [];
    return (decodeLibraryPng(file.bytes).model.annotations as { type: string }[]).filter((a) => a.type === "image") as never;
  });
}
const onlyImage = async (page: Page) => (await savedImages(page))[0]!;

async function livePixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(".lower-canvas")!;
      return Array.from(canvas.getContext("2d")!.getImageData(x, y, 1, 1).data);
    },
    { x, y },
  );
}

async function copiedPixels(page: Page) {
  const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(before + 1);
  const bytes = await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!));
  const png = Uint8Array.from(bytes);
  return { png, px: decodePixels(png) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, shift = false) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

test.describe("pasting an image in the editor", () => {
  test.use({ viewport: { width: 760, height: 560 } });

  test("Ctrl+V adds a centred, selected image; it moves, resizes (corner keeps the shape, Shift frees it, a side stretches), restyles, copies burned in, and reopens editable", async ({
    page,
  }) => {
    await page.goto("/");
    await captureWithPattern(page, W, H, new Date(2026, 10, 16, 10, 0, 0));
    const stage = (await page.locator(".stage").boundingBox())!;
    const pt = (x: number, y: number) => ({ x: stage.x + x, y: stage.y + y });

    await pasteClipboard(page);
    await expect.poll(async () => (await savedImages(page)).length, { timeout: 6000 }).toBe(1);
    let img = await onlyImage(page);
    // Centred at 100% of its pixel size.
    expect([img.x, img.y, img.width, img.height]).toEqual([130, 85, 40, 30]);
    expect(img.border.enabled).toBe(false);
    expect(img.opacity.value).toBe(1);
    // Selected: its Style groups show, and the live canvas shows its pixels.
    await expect(page.getByRole("region", { name: "Border" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Opacity" })).toBeVisible();
    await expect.poll(() => livePixel(page, 140, 100)).toEqual(BLUE);
    expect(await livePixel(page, 160, 100)).toEqual(GREEN);

    // Move: drag from the middle 50 px to the right.
    await drag(page, pt(150, 100), pt(200, 100));
    await expect.poll(async () => Math.round((await onlyImage(page)).x), { timeout: 6000 }).toBe(180);
    img = await onlyImage(page);
    expect([Math.round(img.y), img.width, img.height]).toEqual([85, 40, 30]);

    // The bottom-right corner keeps the shape (4:3): the pointer asks for 80 x 40, the box is 80 x 60.
    await drag(page, pt(220, 115), pt(260, 125));
    await expect.poll(async () => Math.round((await onlyImage(page)).width), { timeout: 6000 }).toBe(80);
    img = await onlyImage(page);
    expect([Math.round(img.x), Math.round(img.y), Math.round(img.width), Math.round(img.height)]).toEqual([180, 85, 80, 60]);

    // With Shift it is free: pointer to (280, 150) makes 100 x 65.
    await drag(page, pt(260, 145), pt(280, 150), true);
    await expect.poll(async () => Math.round((await onlyImage(page)).width), { timeout: 6000 }).toBe(100);
    img = await onlyImage(page);
    expect([Math.round(img.width), Math.round(img.height)]).toEqual([100, 65]);

    // A side handle stretches only that way: the right-middle handle 20 px left.
    await drag(page, pt(280, 117.5), pt(260, 117.5));
    await expect.poll(async () => Math.round((await onlyImage(page)).width), { timeout: 6000 }).toBe(80);
    img = await onlyImage(page);
    expect([Math.round(img.x), Math.round(img.height)]).toEqual([180, 65]);

    // No flipping: dragging the right-middle handle past the left edge leaves a thin image at the left edge.
    await drag(page, pt(260, 117.5), pt(120, 117.5));
    await expect.poll(async () => Math.round((await onlyImage(page)).width), { timeout: 6000 }).toBeLessThan(5);
    img = await onlyImage(page);
    expect(Math.round(img.x)).toBe(180);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => Math.round((await onlyImage(page)).width), { timeout: 6000 }).toBe(80);

    // Border and Opacity through the Style panel.
    const border = page.getByRole("region", { name: "Border" });
    await border.getByRole("button", { name: "On" }).click();
    await border.getByRole("button", { name: "Border width 8" }).click();
    await page.getByLabel("Opacity percent").fill("50");
    await expect.poll(async () => (await onlyImage(page)).opacity.value, { timeout: 6000 }).toBe(0.5);
    img = await onlyImage(page);
    expect(img.border).toMatchObject({ enabled: true, width: 8 });

    // Copy: the picture, its border (inside the edge) and the fading burned in, as a plain PNG.
    const { png, px } = await copiedPixels(page);
    expect(hasChunk(png, "snAP")).toBe(false);
    expect(hasChunk(png, "snIM")).toBe(false);
    const left = Math.round(img.x);
    const top = Math.round(img.y);
    const right = left + Math.round(img.width);
    const bottom = top + Math.round(img.height);
    const color = img.border.color;
    const hex = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    expect(Array.from(at(px, left, top)).slice(0, 3)).toEqual(hex);
    expect(Array.from(at(px, right - 1, bottom - 1)).slice(0, 3)).toEqual(hex);
    expect(Array.from(at(px, left - 1, top + 20))).toEqual(pattern(left - 1, top + 20)); // no growth outside
    const inside = pattern(left + 20, top + 20);
    nearly(Array.from(at(px, left + 20, top + 20)), [inside[0]! / 2, inside[1]! / 2, (inside[2]! + 255) / 2, 255]);

    // Another capture, then back to the first from the Library Strip: the image is still there and editable.
    await expect.poll(async () => (await onlyImage(page)).opacity.value, { timeout: 6000 }).toBe(0.5);
    await captureWithPattern(page, W, H, new Date(2026, 10, 16, 11, 0, 0));
    await page.getByRole("region", { name: "Library Strip" }).getByRole("button").last().click();
    await expect.poll(() => livePixel(page, left + 10, top + 30), { timeout: 6000 }).not.toEqual(pattern(left + 10, top + 30));
    await page.mouse.click(stage.x + left + 30, stage.y + top + 30);
    await expect(page.getByRole("region", { name: "Border" })).toBeVisible();
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await savedImages(page)).length, { timeout: 6000 }).toBe(0);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await savedImages(page)).length, { timeout: 6000 }).toBe(1);
    // The pixels came back with it.
    await expect.poll(() => livePixel(page, left + 10, top + 30), { timeout: 6000 }).not.toEqual(pattern(left + 10, top + 30));
  });

  test("a Blur drawn over a pasted image pixelates it on the live canvas and in the Copy", async ({ page }) => {
    await page.goto("/");
    await captureWithPattern(page, W, H);
    const stage = (await page.locator(".stage").boundingBox())!;
    const pt = (x: number, y: number) => ({ x: stage.x + x, y: stage.y + y });
    await pasteClipboard(page);
    await expect.poll(async () => (await savedImages(page)).length, { timeout: 6000 }).toBe(1);

    await page.keyboard.press("b");
    await page.getByLabel("Block size").fill("40");
    await drag(page, pt(120, 75), pt(200, 125));
    // One flat block of the average of what is beneath it: the picture (half blue, half green) and the Capture.
    const { px } = await copiedPixels(page);
    const a = at(px, 125, 80);
    const b = at(px, 150, 100);
    expect(a.slice(0, 3)).toEqual(b.slice(0, 3)); // same block: one colour
    expect(at(px, 119, 100)).toEqual(pattern(119, 100));
    // Neither the blue nor the green pixel of the picture survives.
    expect(at(px, 135, 100)).not.toEqual(BLUE);
    expect(at(px, 165, 100)).not.toEqual(GREEN);
  });

  test("Ctrl+V inside a text field stays a text paste and adds no image; the image wins over text elsewhere", async ({ page }) => {
    await page.goto("/");
    await captureWithPattern(page, W, H);
    await page.getByLabel("Zoom level").evaluate((el) => {
      const input = document.createElement("input");
      input.type = "text";
      input.id = "probe";
      el.parentElement!.append(input);
      input.focus();
    });
    await pasteClipboard(page, { text: "hello", focus: "#probe" });
    await page.waitForTimeout(300);
    expect(await savedImages(page)).toHaveLength(0);

    await pasteClipboard(page, { text: "hello" });
    await expect.poll(async () => (await savedImages(page)).length, { timeout: 6000 }).toBe(1);
  });

  test("pasting with no image open says to take or open a capture first", async ({ page }) => {
    await page.goto("/");
    await pasteClipboard(page);
    await expect(page.getByRole("status")).toHaveText("Take or open a capture before pasting an image");
  });
});
