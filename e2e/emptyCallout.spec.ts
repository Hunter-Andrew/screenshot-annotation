import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";
import { liveArea } from "./liveCanvas";

// An empty Callout stays (M4 fixes C): a Callout with no text is still a Callout (speech box and tail), whether the
// box was left without typing or its words were cleared. The Text tool keeps its rule: no empty Text Annotation.

interface Saved {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  text: string;
  tip?: { x: number; y: number };
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

test.use({ viewport: { width: 1100, height: 760 } });

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
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  const box = (await page.locator(".stage").boundingBox())!;
  return { at: (x: number, y: number) => ({ x: box.x + x, y: box.y + y }) };
}

const saved = (page: Page): Promise<Saved[]> =>
  page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });

const expectSaved = (page: Page, check: (all: Saved[]) => boolean, message: string) =>
  expect.poll(async () => check(await saved(page)), { message, timeout: 6000, intervals: [200] }).toBe(true);

/** How many red outline pixels the live canvas shows (the speech box and tail are drawn in red). */
async function redPixels(page: Page) {
  const { data } = (await liveArea(page))!;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i]! > 200 && data[i + 1]! < 90 && data[i + 2]! < 90) n++;
  return n;
}

async function copyRedPixels(page: Page) {
  const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(before + 1);
  const png = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!)));
  const px = decodePixels(png);
  let n = 0;
  for (let i = 0; i < px.rgba.length; i += 4) if (px.rgba[i]! > 200 && px.rgba[i + 1]! < 90 && px.rgba[i + 2]! < 90) n++;
  return n;
}

test("a click with the Callout tool and no typing leaves an empty Callout: drawn, selected, saved and exported", async ({ page }) => {
  await page.goto("/");
  const view = await capture(page, 600, 400);
  await page.keyboard.press("o");
  const p = view.at(100, 100);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Escape");

  await expectSaved(page, ([c]) => c?.type === "callout" && c.text === "", "the empty callout is saved");
  expect((await saved(page)).length).toBe(1);
  expect(await redPixels(page)).toBeGreaterThan(100); // the speech box outline is on the canvas
  expect(await copyRedPixels(page)).toBeGreaterThan(100); // and in the Export
  await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
});

test("dragging out a Callout with its tail and leaving the box by clicking away keeps it", async ({ page }) => {
  await page.goto("/");
  const view = await capture(page, 600, 400);
  await page.keyboard.press("o");
  const [from, to] = [view.at(100, 100), view.at(300, 180)];
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("textarea")).toBeFocused();
  await page.mouse.click(view.at(500, 350).x, view.at(500, 350).y); // click away without typing

  await expectSaved(page, ([c]) => c?.type === "callout" && c.text === "" && !!c.tip, "the empty callout and its tail are saved");
});

test("an empty Callout can be moved, resized, and edited by double-click", async ({ page }) => {
  await page.goto("/");
  const view = await capture(page, 600, 400);
  await page.keyboard.press("o");
  const p = view.at(100, 100);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("Escape");
  await expectSaved(page, ([c]) => c?.text === "", "created");
  const [made] = await saved(page);

  // Move: grab inside the speech box and drag it 80 px right and 60 down.
  const inside = view.at(made!.x + 20, made!.y + 10);
  await page.mouse.move(inside.x, inside.y);
  await page.mouse.down();
  await page.mouse.move(inside.x + 40, inside.y + 30, { steps: 4 });
  await page.mouse.move(inside.x + 80, inside.y + 60, { steps: 4 });
  await page.mouse.up();
  await expectSaved(page, ([c]) => !!c && Math.abs(c.x - made!.x - 80) <= 2 && Math.abs(c.y - made!.y - 60) <= 2, "the move is saved");
  const [moved] = await saved(page);
  expect(moved!.text).toBe("");

  // Resize: the right-middle handle (10 px of padding outside the text box, halfway down its one line) 60 px to the right.
  const handle = view.at(moved!.x + moved!.width + 10, moved!.y + 12);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 30, handle.y, { steps: 4 });
  await page.mouse.move(handle.x + 60, handle.y, { steps: 4 });
  await page.mouse.up();
  await expectSaved(page, ([c]) => !!c && Math.abs(c.width - moved!.width - 60) <= 12, "the resize is saved");
  expect((await saved(page))[0]!.text).toBe("");

  // Double-click: edit in place, type, click away.
  const now = (await saved(page))[0]!;
  const onBox = view.at(now.x + 10, now.y + 10);
  await page.waitForTimeout(500);
  await page.mouse.dblclick(onBox.x, onBox.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type("Now with words");
  await page.mouse.click(view.at(500, 380).x, view.at(500, 380).y);
  await expectSaved(page, ([c]) => c?.text === "Now with words", "the words are saved");
  expect((await saved(page)).length).toBe(1);
});

test("clearing a Callout's words keeps the Callout with empty text (no fallback to the old words)", async ({ page }) => {
  await page.goto("/");
  const view = await capture(page, 600, 400);
  await page.keyboard.press("o");
  const p = view.at(100, 100);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.type("Remove me");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([c]) => c?.text === "Remove me", "created");
  const [made] = await saved(page);

  await page.waitForTimeout(500);
  const onBox = view.at(made!.x + 10, made!.y + 10);
  await page.mouse.dblclick(onBox.x, onBox.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");

  await expectSaved(page, ([c]) => c?.type === "callout" && c.text === "", "the cleared callout is saved with empty text");
  expect((await saved(page)).length).toBe(1);
  expect(await redPixels(page)).toBeGreaterThan(100);
});

test("the Text tool still makes no empty Text Annotation", async ({ page }) => {
  await page.goto("/");
  const view = await capture(page, 600, 400);
  await page.keyboard.press("t");
  const p = view.at(100, 100);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1400);
  expect(await saved(page)).toEqual([]);
});
