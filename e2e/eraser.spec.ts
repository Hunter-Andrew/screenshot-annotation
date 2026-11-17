import { expect, type Page, test } from "@playwright/test";
import { liveArea } from "./liveCanvas";

// The Pen's Eraser mode in real Chromium with the real Fabric canvas and the fake platform bridge (same setup
// as pen.spec.ts). The model is read back by decoding the Library PNG the editor auto-saved; the live canvas
// is read from its pixels, at 100% zoom. The Capture is a flat grey (200), the default pen is red, 4 px thick.

interface Saved {
  id: string;
  type: string;
  points: { x: number; y: number }[];
  stroke: { color: string; width: number };
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

const W = 300;
const H = 200;
const GREY = [200, 200, 200, 255];
const RED = [224, 36, 36, 255];

async function openCapture(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ({ W, H }) => {
      const rgba = new Uint8Array(W * H * 4).fill(200);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width: W, height: H, rgba, capturedAt: new Date() });
    },
    { W, H },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await page.keyboard.press("Control+1"); // 100%: one canvas pixel per image pixel
  const box = (await page.locator(".stage").boundingBox())!;
  expect(box.width).toBeCloseTo(W, 0);
  return { at: (x: number, y: number) => ({ x: box.x + x, y: box.y + y }) };
}
type View = Awaited<ReturnType<typeof openCapture>>;

async function saved(page: Page): Promise<Saved[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}
async function expectSaved(page: Page, check: (all: Saved[]) => boolean, message: string) {
  await expect.poll(async () => check(await saved(page)), { message, timeout: 6000, intervals: [200] }).toBe(true);
}

async function drag(page: Page, points: { x: number; y: number }[], release = true) {
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
  if (release) await page.mouse.up();
}

async function pixel(page: Page, x: number, y: number) {
  return (await liveArea(page, { x, y, w: 1, h: 1 }))!.data;
}

async function chooseEraser(page: Page, size: number) {
  await page.keyboard.press("p");
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  const box = page.getByRole("spinbutton", { name: "Eraser size number" });
  await box.fill(String(size));
  await expect(page.getByRole("slider", { name: "Eraser size" })).toHaveValue(String(size));
}

/** A long red stroke along y from x=20 to x=280. */
async function drawLine(page: Page, view: View, y: number) {
  await page.keyboard.press("p");
  await drag(page, [view.at(20, y), view.at(150, y), view.at(280, y)]);
}

const close = (a: number, b: number, tolerance = 3) => Math.abs(a - b) <= tolerance;
const xs = (s: Saved) => s.points.map((p) => p.x);

test.describe("the Pen's Eraser mode", () => {
  test.use({ viewport: { width: 760, height: 560 } });

  test("an erase drag cuts the stroke where the circle passed, live while dragging, and saves two strokes", async ({ page }) => {
    const view = await openCapture(page);
    await drawLine(page, view, 100);
    await expectSaved(page, (all) => all.length === 1, "drawn");
    const [original] = await saved(page);
    await chooseEraser(page, 40); // radius 20

    // Press above the stroke, drag down through it at x=150, and hold: nothing is released yet.
    await drag(page, [view.at(150, 60), view.at(150, 100), view.at(150, 140)], false);

    // Live: the part within 20 px of the path is already gone, the rest is still there.
    expect(await pixel(page, 150, 100)).toEqual(GREY);
    expect(await pixel(page, 135, 100)).toEqual(GREY);
    expect(await pixel(page, 100, 100)).toEqual(RED);
    expect(await pixel(page, 200, 100)).toEqual(RED);
    // Nothing is saved until release: still the one whole stroke.
    expect((await saved(page)).map((s) => s.points.length)).toEqual([original!.points.length]);

    await page.mouse.up();
    await expectSaved(page, (all) => all.length === 2, "two strokes after the erase");
    const [left, right] = await saved(page);
    expect(left!.type).toBe("pen");
    expect(right!.type).toBe("pen");
    expect(left!.stroke).toEqual(original!.stroke);
    expect(right!.stroke).toEqual(original!.stroke);
    expect(close(Math.max(...xs(left!)), 130, 2)).toBe(true); // 150 - 20
    expect(close(Math.min(...xs(right!)), 170, 2)).toBe(true);
    expect(close(Math.min(...xs(left!)), 20)).toBe(true);
    expect(close(Math.max(...xs(right!)), 280)).toBe(true);
    // Still the Pen tool, and the cut ends are what is drawn.
    await expect(page.getByRole("button", { name: "Pen (P)" })).toHaveAttribute("aria-pressed", "true");
    expect(await pixel(page, 150, 100)).toEqual(GREY);
    expect(await pixel(page, 100, 100)).toEqual(RED);
  });

  test("a click cuts a hole the size of the eraser; an end erased shortens, a stroke wholly covered is deleted", async ({ page }) => {
    const view = await openCapture(page);
    await drawLine(page, view, 100);
    await chooseEraser(page, 30); // radius 15

    await page.mouse.click(view.at(150, 103).x, view.at(150, 103).y); // 3 px off the line
    await expectSaved(page, (all) => all.length === 2, "the click split the stroke");
    const [a, b] = await saved(page);
    const hole = Math.sqrt(15 * 15 - 3 * 3); // the circle covers x 150 +- 14.7 on the line
    expect(close(Math.max(...xs(a!)), 150 - hole, 1.5)).toBe(true);
    expect(close(Math.min(...xs(b!)), 150 + hole, 1.5)).toBe(true);

    // The left end: wipe from before the start to x=60.
    await drag(page, [view.at(0, 100), view.at(60, 100)]);
    await expectSaved(page, (all) => all.length === 2 && Math.min(...xs(all[0]!)) > 70, "the left piece was shortened");

    // The right piece is covered end to end.
    await drag(page, [view.at(160, 100), view.at(300, 100)]);
    await expectSaved(page, (all) => all.length === 1, "the right piece is gone");
  });

  test("the whole drag, over several strokes, is ONE undo step, and so is the redo", async ({ page }) => {
    const view = await openCapture(page);
    await drawLine(page, view, 60);
    await drawLine(page, view, 140);
    await expectSaved(page, (all) => all.length === 2, "two strokes");
    const whole = await saved(page);
    await chooseEraser(page, 30);

    await drag(page, [view.at(150, 20), view.at(150, 100), view.at(150, 180)]);
    await expectSaved(page, (all) => all.length === 4, "both cut in two");
    const cut = await saved(page);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expectSaved(page, (all) => all.length === 2 && JSON.stringify(all) === JSON.stringify(whole), "one Undo restores both strokes");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expectSaved(page, (all) => JSON.stringify(all) === JSON.stringify(cut), "one Redo cuts both again");
  });

  test("Esc during the drag cancels it: the strokes come back and nothing is recorded", async ({ page }) => {
    const view = await openCapture(page);
    await drawLine(page, view, 100);
    await expectSaved(page, (all) => all.length === 1, "drawn");
    const whole = await saved(page);
    await chooseEraser(page, 40);

    await drag(page, [view.at(150, 60), view.at(150, 100), view.at(150, 140)], false);
    expect(await pixel(page, 150, 100)).toEqual(GREY); // erased live
    await page.keyboard.press("Escape");
    expect(await pixel(page, 150, 100)).toEqual(RED); // restored
    await page.mouse.up();

    await page.waitForTimeout(1500); // longer than the autosave pause
    expect(await saved(page)).toEqual(whole);
    // The only step is the drawing: Undo removes the stroke, it does not undo an erase.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expectSaved(page, (all) => all.length === 0, "Undo took back the drawing");
  });

  test("only Pen strokes are cut: a Highlighter stroke and a Rectangle under the same drag are untouched", async ({ page }) => {
    const view = await openCapture(page);
    await page.keyboard.press("h");
    await drag(page, [view.at(20, 100), view.at(280, 100)]);
    await page.keyboard.press("r");
    await drag(page, [view.at(100, 40), view.at(200, 170)]);
    await drawLine(page, view, 100);
    await expectSaved(page, (all) => all.length === 3, "highlight, rectangle and pen");
    const before = await saved(page);
    await chooseEraser(page, 60);

    await drag(page, [view.at(150, 20), view.at(150, 100), view.at(150, 180)]);

    await expectSaved(page, (all) => all.filter((a) => a.type === "pen").length === 2, "the pen was cut");
    const after = await saved(page);
    expect(after.find((a) => a.type === "highlight")).toEqual(before.find((a) => a.type === "highlight"));
    expect(after.find((a) => a.type === "rect")).toEqual(before.find((a) => a.type === "rect"));
  });

  test("the cursor is an outline circle of the eraser's size, only in Eraser mode, following the pointer", async ({ page }) => {
    const view = await openCapture(page);
    await page.keyboard.press("p");
    const p = view.at(150, 100);
    await page.mouse.move(p.x, p.y);
    // Pen mode: no circle.
    expect(await liveArea(page, { x: 168, y: 90, w: 6, h: 20 })).toBeTruthy();
    const ring = async (cx: number, cy: number, radius: number) => {
      const area = (await liveArea(page, { x: cx + radius - 3, y: cy - 3, w: 7, h: 7 }))!;
      let marked = 0;
      for (let i = 0; i < area.data.length; i += 4) if (area.data[i] !== 200 || area.data[i + 1] !== 200) marked++;
      return marked;
    };
    expect(await ring(150, 100, 25)).toBe(0);

    await chooseEraser(page, 50); // radius 25
    await page.mouse.move(p.x + 1, p.y);
    await page.mouse.move(p.x, p.y);
    expect(await ring(150, 100, 25)).toBeGreaterThan(0); // the outline passes 25 px from the pointer
    expect(await ring(150, 100, 45)).toBe(0); // and there is nothing at 45
    expect(await pixel(page, 150, 100)).toEqual(GREY); // hollow: it does not hide what is under it

    // It follows the pointer, and goes with it when the pointer leaves.
    const q = view.at(60, 60);
    await page.mouse.move(q.x, q.y, { steps: 3 });
    expect(await ring(60, 60, 25)).toBeGreaterThan(0);
    expect(await ring(150, 100, 25)).toBe(0);
    await page.mouse.move(5, 5);
    expect(await ring(60, 60, 25)).toBe(0);

    // Back to Pen mode: the circle is gone.
    await page.getByRole("button", { name: "Pen", exact: true }).click();
    await page.mouse.move(p.x, p.y, { steps: 2 });
    expect(await ring(150, 100, 25)).toBe(0);
  });

  test("the cursor circle scales with the zoom", async ({ page }) => {
    const view = await openCapture(page);
    await chooseEraser(page, 40); // radius 20 at 100%
    await page.keyboard.press("Control+="); // zoom in
    const box = (await page.locator(".stage").boundingBox())!;
    const scale = box.width / W;
    expect(scale).toBeGreaterThan(1);
    const cx = box.x + 150 * scale;
    const cy = box.y + 100 * scale;
    await page.mouse.move(cx - 3, cy);
    await page.mouse.move(cx, cy);
    void view;
    // The ring is at 20 * scale screen pixels from the pointer: look for it in the canvas bitmap.
    const found = await page.evaluate(
      ({ cx, cy, radius }) => {
        const canvas = document.querySelector<HTMLCanvasElement>("canvas.lower-canvas")!;
        const box = canvas.getBoundingClientRect();
        const context = canvas.getContext("2d")!;
        const at = (dx: number) => {
          const d = context.getImageData(Math.round(cx - box.left + dx), Math.round(cy - box.top), 1, 1).data;
          return d[0] !== 200 || d[1] !== 200;
        };
        const near = (r: number) => [-2, -1, 0, 1, 2].some((e) => at(r + e));
        return { onRing: near(radius), inside: near(radius * 0.5), far: near(radius * 1.6) };
      },
      { cx, cy, radius: 20 * scale },
    );
    expect(found).toEqual({ onRing: true, inside: false, far: false });
  });
});
