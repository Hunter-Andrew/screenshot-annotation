import { expect, type Page, test } from "@playwright/test";

// Rubber-band multi-selection with the Select tool, in real Chromium with the real Fabric canvas: drag a frame round
// several Annotations, Shift-click to add one, drag any of them to move them all, Delete removes them all, and each
// of those is one Undo step.

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };
interface Rect {
  id: string;
  type: string;
  x: number;
  y: number;
}

async function capture(page: Page, width: number, height: number) {
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
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

async function saved(page: Page): Promise<Rect[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as Rect[]) : [];
  });
}

async function mapper(page: Page, width: number) {
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  const box = (await page.locator(".stage").boundingBox())!;
  const scale = box.width / width;
  return (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale });
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test.use({ viewport: { width: 1300, height: 760 } });

/** Three filled-in-nothing rectangles side by side (the Rectangle tool keeps drawing), then the Select tool. */
async function threeRectangles(page: Page) {
  await page.goto("/");
  await capture(page, 600, 400);
  const at = await mapper(page, 600);
  await page.keyboard.press("r");
  await drag(page, at(40, 60), at(120, 120));
  await drag(page, at(200, 60), at(280, 120));
  await drag(page, at(360, 60), at(440, 120));
  await expect.poll(async () => (await saved(page)).length, { timeout: 6000 }).toBe(3);
  await page.keyboard.press("v");
  return at;
}

const xs = async (page: Page) => (await saved(page)).map((a) => Math.round(a.x));

test("a frame round two rectangles selects both; dragging moves both as one Undo step", async ({ page }) => {
  const at = await threeRectangles(page);
  await drag(page, at(20, 30), at(300, 160)); // round the first two only
  await expect(page.getByText("2 Annotations selected")).toBeVisible();

  // Move the group by pressing inside its frame.
  await drag(page, at(160, 90), at(260, 140));
  await expect.poll(() => xs(page), { timeout: 6000 }).toEqual([140, 300, 360]);

  await page.keyboard.press("Control+z");
  await expect.poll(() => xs(page), { timeout: 6000 }).toEqual([40, 200, 360]);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => xs(page), { timeout: 6000 }).toEqual([140, 300, 360]);
});

test("Delete removes every selected Annotation in one Undo step", async ({ page }) => {
  const at = await threeRectangles(page);
  await drag(page, at(20, 30), at(300, 160));
  await expect(page.getByText("2 Annotations selected")).toBeVisible();
  await page.keyboard.press("Delete");
  await expect.poll(() => xs(page), { timeout: 6000 }).toEqual([360]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => xs(page), { timeout: 6000 }).toEqual([40, 200, 360]);
});

test("Shift-click adds an Annotation to the selection, and a click on empty space clears it", async ({ page }) => {
  const at = await threeRectangles(page);
  await page.mouse.click(at(80, 60).x, at(80, 60).y); // the first rectangle's top edge
  await page.keyboard.down("Shift");
  await page.mouse.click(at(240, 60).x, at(240, 60).y);
  await page.keyboard.up("Shift");
  await expect(page.getByText("2 Annotations selected")).toBeVisible();

  await page.mouse.click(at(300, 300).x, at(300, 300).y); // empty space
  await expect(page.getByText("2 Annotations selected")).toHaveCount(0);
});

test("a drawing tool still draws where the frame would start: no rubber band while a tool is picked", async ({ page }) => {
  const at = await threeRectangles(page);
  await page.keyboard.press("r");
  await drag(page, at(20, 200), at(100, 260));
  await expect.poll(async () => (await saved(page)).length, { timeout: 6000 }).toBe(4);
  await expect(page.getByText(/Annotations selected/)).toHaveCount(0);
});
