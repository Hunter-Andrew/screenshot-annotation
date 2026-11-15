import { expect, type Page, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";

// The Pen tool in real Chromium with the real Fabric canvas and the fake platform bridge (same setup as
// annotate.spec.ts; the model is read back by decoding the Library PNG the editor auto-saved).

interface Pen {
  id: string;
  type: "pen";
  points: { x: number; y: number }[];
  stroke: { color: string; width: number };
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

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

async function savedAnnotations(page: Page): Promise<Pen[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}

async function expectSaved(page: Page, check: (pens: Pen[]) => boolean, message: string) {
  await expect
    .poll(async () => check(await savedAnnotations(page)), { message, timeout: 6000, intervals: [200] })
    .toBe(true);
}

async function mapper(page: Page, width: number) {
  const box = (await page.locator(".stage").boundingBox())!;
  const scale = box.width / width;
  return { scale, at: (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale }) };
}

/** Press at the first point, move through the rest, release. */
async function stroke(page: Page, points: { x: number; y: number }[]) {
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.up();
}

const close = (a: number, b: number, tolerance = 3) => Math.abs(a - b) <= tolerance;
const pixelAt = (p: ReturnType<typeof decodePixels>, x: number, y: number) =>
  Array.from(p.rgba.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

test.describe("a Pen stroke's life", () => {
  test.use({ viewport: { width: 760, height: 520 } });

  test("P draws a stroke that is stored as points, then move, restyle, reload, still editable", async ({ page }) => {
    await page.goto("/");
    await capture(page, 600, 400);
    const view = await mapper(page, 600);

    await page.keyboard.press("p");
    await expect(page.getByRole("button", { name: /^Pen/ })).toHaveAttribute("aria-pressed", "true");
    // A wave from x=80 to x=400.
    const wave = Array.from({ length: 17 }, (_, i) => view.at(80 + i * 20, 150 + Math.sin(i / 2) * 40));
    await stroke(page, wave);

    await expectSaved(
      page,
      ([p]) => !!p && p.type === "pen" && p.points.length > 5 && close(p.points[0]!.x, 80) && close(p.points.at(-1)!.x, 400),
      "the stroke is saved as its points",
    );
    const [saved] = await savedAnnotations(page);
    expect(saved!.stroke).toEqual({ color: "#e02424", width: 4 });
    // The Pen keeps drawing by default (see behavior.spec.ts): still the Pen, nothing selected. V for Select.
    await expect(page.getByRole("button", { name: /^Pen/ })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("v");
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");

    // Move: grab the stroke where it is (its first point) and drag it 100 px down.
    const first = saved!.points[0]!;
    const grab = view.at(first.x, first.y);
    await stroke(page, [grab, { x: grab.x, y: grab.y + 50 * view.scale }, { x: grab.x, y: grab.y + 100 * view.scale }]);
    // Selected: the panel offers Stroke but no Arrowheads.
    await expect(page.getByRole("region", { name: "Stroke" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Arrowheads" })).toHaveCount(0);
    await expectSaved(
      page,
      ([p]) => !!p && close(p.points[0]!.y, first.y + 100) && close(p.points[0]!.x, first.x) && p.points.length === saved!.points.length,
      "moving shifts every point and keeps the shape",
    );

    // Restyle from the Style panel.
    await page.getByRole("button", { name: "Color #2563eb" }).click();
    await page.getByRole("button", { name: "Thickness 8" }).click();
    await expectSaved(page, ([p]) => p?.stroke.color === "#2563eb" && p.stroke.width === 8, "the restyle is saved");

    // Reload: still there, still selectable and movable.
    await page.reload();
    await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
    await expect(page.locator(".canvas-container")).toHaveCount(1);
    const again = await mapper(page, 600);
    const [moved] = await savedAnnotations(page);
    const start = moved!.points[0]!;
    const at = again.at(start.x, start.y);
    await stroke(page, [at, { x: at.x + 30 * again.scale, y: at.y }, { x: at.x + 60 * again.scale, y: at.y }]);
    await expectSaved(page, ([p]) => !!p && close(p.points[0]!.x, start.x + 60), "the reopened stroke moved");
    expect(await page.evaluate(() => (window as unknown as InPage).__fakeBridge.libraryFiles.length)).toBe(1);
  });

  test("a click with the Pen draws nothing", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    const view = await mapper(page, 400);
    await page.keyboard.press("p");
    const p = view.at(100, 100);
    await page.mouse.click(p.x, p.y);

    await page.waitForTimeout(1300);
    expect(await savedAnnotations(page)).toEqual([]);
  });

  test("Copy has the stroke burned in, and is still a plain PNG", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    const view = await mapper(page, 400);
    await page.keyboard.press("p");
    await stroke(page, [view.at(50, 150), view.at(150, 150), view.at(250, 150), view.at(350, 150)]);
    await expectSaved(page, ([p]) => !!p, "drawn");

    await page.getByRole("button", { name: "Copy" }).click();

    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
    const png = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[0]!)));
    expect(hasChunk(png, "snAP")).toBe(false);
    const pixels = decodePixels(png);
    expect([pixels.width, pixels.height]).toEqual([400, 300]);
    const [pen] = await savedAnnotations(page);
    const y = Math.round(pen!.points[0]!.y);
    expect(pixelAt(pixels, 200, y)).toEqual([224, 36, 36, 255]); // on the stroke (#e02424)
    expect(pixelAt(pixels, 200, y - 40)).toEqual([200, 200, 200, 255]); // the Capture's own grey
  });
});

test.describe("the renderer draws the same smoothing as the canvas", () => {
  test("rounds a corner: on the curve is ink, the sharp corner itself is not", async ({ page }) => {
    await page.goto("/");
    const png = await page.evaluate(async () => {
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const { renderFinished } = await import(/* @vite-ignore */ "/src/canvas/renderFinished.ts" as string);
      const capture = encodeRgbaPng(100, 60, new Uint8Array(100 * 60 * 4).fill(255));
      const pen = {
        id: "p",
        type: "pen" as const,
        // Right, then up: the corner point is (50, 30).
        points: [{ x: 10, y: 30 }, { x: 50, y: 30 }, { x: 50, y: 10 }],
        stroke: { color: "#e02424", width: 4 },
      };
      return Array.from(await renderFinished({ capture, model: { formatVersion: 1, annotations: [pen], crop: null } }));
    });

    const p = decodePixels(Uint8Array.from(png));
    expect(pixelAt(p, 20, 30)).toEqual([224, 36, 36, 255]); // straight part
    expect(pixelAt(p, 40, 27)).toEqual([224, 36, 36, 255]); // the curve's middle is at (40, 27.5)
    expect(pixelAt(p, 52, 32)).toEqual([255, 255, 255, 255]); // the unsmoothed corner is cut off
    expect(pixelAt(p, 50, 12)).toEqual([224, 36, 36, 255]); // ends exactly at the last point
    expect(pixelAt(p, 5, 30)).toEqual([255, 255, 255, 255]); // nothing before the first point
  });
});
