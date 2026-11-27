import { expect, type Page, test } from "@playwright/test";

// The Text box tool (with its minimum width), Ctrl+Z on a box just placed, moving a Callout without or with its tail,
// and the right-click menu: in real Chromium with the real Fabric canvas and the fake bridge.

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

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
  await page.evaluate(() => {
    const rgba = new Uint8Array(600 * 400 * 4).fill(200);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    (window as unknown as InPage).__fakeBridge.simulateCapture({ width: 600, height: 400, rgba, capturedAt: new Date() });
  });
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  const box = (await page.locator(".stage").boundingBox())!;
  return (x: number, y: number) => ({ x: box.x + x, y: box.y + y });
}

async function saved(page: Page): Promise<Saved[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}
const expectSaved = (page: Page, check: (all: Saved[]) => boolean, message: string) =>
  expect.poll(async () => check(await saved(page)), { message, timeout: 6000, intervals: [200] }).toBe(true);

test("X draws a Text box with no tail; a narrow drag widens to the minimum width, only at placement", async ({ page }) => {
  const at = await open(page);
  await page.keyboard.press("x");
  await expect(page.getByRole("button", { name: /^Text box/ })).toHaveAttribute("aria-pressed", "true");
  for (const name of ["Font", "Text outline", "Stroke", "Fill"]) await expect(page.getByRole("region", { name })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tail" })).toHaveCount(0);

  // A narrow drag (60 px) becomes the 240 px default minimum.
  const from = at(100, 100);
  const to = at(160, 180);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type("Note");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Note", "the text box is saved");
  const [made] = await saved(page);
  expect(made).toMatchObject({ type: "textbox", width: 240 });
  expect(made!.x).toBeCloseTo(100, -1); // the stage sits on a half pixel
  expect(made).not.toHaveProperty("tip");

  // Resizing by hand below the minimum is never overridden: drag the right-middle handle in.
  await page.keyboard.press("Escape");
  const handle = at(100 + 240 + 10, 100 + 40);
  await page.mouse.click(at(120, 140).x, at(120, 140).y);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x - 150, handle.y, { steps: 5 });
  await page.mouse.up();
  await expectSaved(page, ([t]) => (t?.width ?? 999) < 240, "a hand-narrowed box stays narrow");
});

test("Ctrl+Z while typing in a box just placed takes the placing back", async ({ page }) => {
  const at = await open(page);
  for (const key of ["o", "x"]) {
    await page.keyboard.press(key);
    const p = at(100, 100);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator("textarea")).toBeFocused();
    await page.keyboard.type("gone");
    await page.keyboard.press("Control+z");
    await expect(page.locator("textarea")).toHaveCount(0);
    await page.waitForTimeout(1200);
    expect(await saved(page)).toEqual([]);
  }
});

test("dragging a callout keeps its tail's tip where it was; with Shift the tip moves along", async ({ page }) => {
  const at = await open(page);
  await page.keyboard.press("o");
  // Press at (100,100) is the tip; the release (160,140) is where the tail ends and the box starts.
  const a = at(100, 100);
  const b = at(160, 140);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([c]) => c?.text === "Hi", "the callout is saved");
  const [made] = await saved(page);
  const tipAt = (c: Saved) => ({ x: c.x + c.tip!.x, y: c.y + c.tip!.y });
  expect(tipAt(made!).x).toBeCloseTo(100, -1);
  expect(tipAt(made!).y).toBeCloseTo(100, -1);

  // Plain drag from inside the box (its middle): the box moves 100 right and 80 down, the tip stays.
  const grab = at(made!.x + 60, made!.y + 15);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 100, grab.y + 80, { steps: 8 });
  await page.mouse.up();
  await expectSaved(page, ([c]) => (c?.x ?? 0) > made!.x + 90, "the callout moved");
  const [moved] = await saved(page);
  expect(moved!.x - made!.x).toBeCloseTo(100, -1);
  expect(tipAt(moved!).x).toBeCloseTo(tipAt(made!).x, 3);
  expect(tipAt(moved!).y).toBeCloseTo(tipAt(made!).y, 3);

  // Shift-drag: the tip moves with the box (the offset is unchanged).
  const grab2 = at(moved!.x + 60, moved!.y + 15);
  await page.keyboard.down("Shift");
  await page.mouse.move(grab2.x, grab2.y);
  await page.mouse.down();
  await page.mouse.move(grab2.x - 50, grab2.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expectSaved(page, ([c]) => (c?.x ?? 0) < moved!.x - 40, "the callout moved again");
  const [shifted] = await saved(page);
  expect(shifted!.tip).toEqual(moved!.tip);
});

test("right-clicking the canvas opens Paste, Copy and Copy original image; the last copies the bare Capture", async ({ page }) => {
  const at = await open(page);
  // An annotation, so that the two copies differ.
  await page.keyboard.press("r");
  const a = at(50, 50);
  const b = at(150, 120);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expectSaved(page, ([r]) => r?.type === "rect", "the rectangle is saved");

  const p = at(300, 200);
  await page.mouse.click(p.x, p.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Canvas" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText([/Paste/, /^Copy/, /Copy original image/]);
  await menu.getByRole("menuitem", { name: /^Copy(?! original)/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);

  await page.mouse.click(p.x, p.y, { button: "right" });
  await page.getByRole("menuitem", { name: /Copy original image/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(2);
  const [annotated, original] = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.map((b) => Array.from(b)));
  expect(original).not.toEqual(annotated);
});
