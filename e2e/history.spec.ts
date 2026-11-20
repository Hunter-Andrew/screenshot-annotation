import { expect, type Page, test } from "@playwright/test";
import { shapesReturnToSelect } from "./legacyStyles";

// Ticket 13 on the real Fabric canvas: undo/redo (also across a page reload, which stands in for a
// restart: the fake platform keeps the Library and the history files in localStorage), delete and
// stacking order. The model is read back the way the next app start reads it: from the Library PNG.

interface Annotation {
  id: string;
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  libraryFiles: { path: string; bytes: Uint8Array }[];
  historyFiles: Map<string, { text: string; modifiedAt: number }>;
}
type InPage = { __fakeBridge: Bridge };

test.use({ viewport: { width: 760, height: 520 } });

async function capture(page: Page, width: number, height: number) {
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge)); // the app installs the fake bridge a moment after load
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4).fill(200);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba });
    },
    { width, height },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
}

const saved = (page: Page): Promise<Annotation[]> =>
  page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
const savedIds = async (page: Page) => (await saved(page)).map((a) => a.id);

/** How many undo and redo steps the stored history file holds. */
const storedSteps = (page: Page) =>
  page.evaluate(() => {
    const [file] = [...(window as unknown as InPage).__fakeBridge.historyFiles.values()];
    if (!file) return null;
    const { history } = JSON.parse(file.text);
    return { undo: history.undo.length as number, redo: history.redo.length as number };
  });

async function mapper(page: Page, width: number) {
  const box = (await page.locator(".stage").boundingBox())!;
  const scale = box.width / width;
  return { at: (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale }) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

/** Two horizontal arrows, the second one drawn on top; returns their ids in stacking order. */
async function drawTwo(page: Page) {
  const view = await mapper(page, 600);
  await page.keyboard.press("a");
  await drag(page, view.at(80, 120), view.at(320, 120));
  await page.keyboard.press("a");
  await drag(page, view.at(80, 260), view.at(320, 260));
  await expect.poll(async () => (await saved(page)).length, { timeout: 6000, intervals: [200] }).toBe(2);
  return { view, ids: await savedIds(page) };
}

test.beforeEach(async ({ page }) => {
  await shapesReturnToSelect(page);
});

test("undo and redo survive a reload, twice over", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 400);
  const { ids } = await drawTwo(page);
  await expect.poll(() => storedSteps(page), { timeout: 6000, intervals: [200] }).toEqual({ undo: 2, redo: 0 });

  // Undo the second arrow, then reload ("restart").
  await page.keyboard.press("Control+z");
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual([ids[0]]);
  await expect.poll(() => storedSteps(page), { timeout: 6000, intervals: [200] }).toEqual({ undo: 1, redo: 1 });
  await page.reload();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();

  // Redo brings the second arrow back, from history that came from the file.
  await page.keyboard.press("Control+y");
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual(ids);
  await expect.poll(() => storedSteps(page), { timeout: 6000, intervals: [200] }).toEqual({ undo: 2, redo: 0 });

  // Reload again and undo both: back to the bare Capture.
  await page.reload();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z"); // redo with the other key...
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual([]);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("history is dropped when the PNG is changed outside the app", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 400);
  await drawTwo(page);
  await expect.poll(() => storedSteps(page), { timeout: 6000, intervals: [200] }).toEqual({ undo: 2, redo: 0 });

  // "Another program" rewrites the file (same content, one byte of ancillary data different).
  await page.evaluate(() => {
    const bridge = (window as unknown as InPage).__fakeBridge;
    const bytes = bridge.libraryFiles[0]!.bytes;
    const changed = new Uint8Array(bytes);
    changed[changed.length - 1] ^= 0xff; // the IEND CRC: still opens (the chunk walk does not check it)
    bridge.libraryFiles[0]!.bytes = changed;
    // Persist the way the fake does on every write.
    return (bridge as unknown as { updateLibraryFile(p: string, b: Uint8Array): Promise<void> }).updateLibraryFile(
      bridge.libraryFiles[0]!.path,
      changed,
    );
  });
  await page.reload();
  await expect(page.locator(".canvas-container")).toHaveCount(1);

  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  expect(await storedSteps(page)).toBeNull();
});

test("Delete removes the selected arrow, Ctrl+Z brings it back where it was", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 400);
  const { view, ids } = await drawTwo(page);

  await page.mouse.click(view.at(200, 120).x, view.at(200, 120).y); // select the first (bottom) arrow
  await expect(page.getByRole("region", { name: "Arrange" })).toBeVisible();
  await page.keyboard.press("Delete");
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual([ids[1]]);
  await expect(page.getByRole("region", { name: "Arrange" })).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual(ids);

  // Backspace works too, and a click on empty canvas leaves nothing to delete.
  await page.mouse.click(view.at(200, 120).x, view.at(200, 120).y);
  await page.keyboard.press("Backspace");
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual([ids[1]]);
  await page.mouse.click(view.at(500, 350).x, view.at(500, 350).y);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(1300);
  expect(await savedIds(page)).toEqual([ids[1]]);
});

test("Bring forward and Send back change the stacking order, and it is undoable", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 400);
  const { view, ids } = await drawTwo(page);

  await page.mouse.click(view.at(200, 120).x, view.at(200, 120).y); // the bottom arrow
  await page.getByRole("button", { name: "Bring forward" }).click();
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual([ids[1], ids[0]]);
  await expect(page.getByRole("button", { name: "Bring forward" })).toBeDisabled();

  await page.keyboard.press("Control+[");
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual(ids);

  await page.keyboard.press("Control+]");
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual([ids[1], ids[0]]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => savedIds(page), { timeout: 6000, intervals: [200] }).toEqual(ids);
});

test("typing in the thickness box does not undo or delete on the canvas", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 400);
  const { ids } = await drawTwo(page);

  const box = page.getByRole("spinbutton");
  await box.click();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(1300);

  expect(await savedIds(page)).toEqual(ids);
});
