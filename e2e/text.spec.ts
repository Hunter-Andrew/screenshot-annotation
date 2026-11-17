import { expect, type Page, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";

// The Text tool in real Chromium with the real Fabric canvas and the fake platform bridge. The model
// is read back the way the next app start reads it: by decoding the auto-saved Library PNG.

interface Text {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  text: string;
  font: { size: number; bold: boolean; italic: boolean; color: string; align?: string };
  textOutline: { enabled: boolean; color: string; width: number };
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

test.use({ viewport: { width: 1100, height: 760 } });

/** A flat grey (200) Capture, so any pixel's expected value is known. */
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

async function saved(page: Page): Promise<Text[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}

async function expectSaved(page: Page, check: (texts: Text[]) => boolean, message: string) {
  await expect
    .poll(async () => check(await saved(page)), { message, timeout: 6000, intervals: [200] })
    .toBe(true);
}

async function mapper(page: Page, width: number) {
  const box = (await page.locator(".stage").boundingBox())!;
  const scale = box.width / width;
  return { scale, at: (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale }) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

const close = (a: number, b: number, tolerance = 3) => Math.abs(a - b) <= tolerance;

/** Capture 100% so one screen pixel is one Capture pixel; returns the point mapper. */
async function atActualSize(page: Page, width: number) {
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  const view = await mapper(page, width);
  expect(view.scale).toBeCloseTo(1, 2);
  return view;
}

test("click with the Text tool, type on the image: red text with a white outline", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);

  // T picks the tool; typing T, A, V and E into the box must not switch tools (bare keys are suspended).
  await page.keyboard.press("t");
  await expect(page.getByRole("button", { name: /^Text/ })).toHaveAttribute("aria-pressed", "true");
  const at = view.at(60, 80);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type("tave Text");
  await expect(page.getByRole("button", { name: /^Text/ })).toHaveAttribute("aria-pressed", "true");
  // Nothing is an Annotation until the typing ends.
  expect(await saved(page)).toEqual([]);

  await page.keyboard.press("Escape");

  await expectSaved(page, ([t]) => t?.text === "tave Text", "the typed text is saved");
  const [text] = await saved(page);
  expect(text).toMatchObject({
    type: "text",
    font: { size: 24, bold: false, italic: false, color: "#e02424" },
    textOutline: { enabled: true, color: "#ffffff", width: 2 },
  });
  expect(close(text!.x, 60) && close(text!.y, 80)).toBe(true);
  // Like a drawn shape: it is selected, the Style panel shows Font and Text outline, the tool is Select.
  await expect(page.getByRole("region", { name: "Font" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Text outline" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("textarea")).toHaveCount(0);

  // Typing and pressing T is the text's again once the box is gone: now T picks the tool.
  await page.keyboard.press("t");
  await expect(page.getByRole("button", { name: /^Text/ })).toHaveAttribute("aria-pressed", "true");
});

test("a click that types nothing makes no Annotation", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 300);
  const view = await atActualSize(page, 400);

  await page.keyboard.press("t");
  await page.mouse.click(view.at(50, 50).x, view.at(50, 50).y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(page.locator("textarea")).toHaveCount(0);
  await page.waitForTimeout(1300);
  expect(await saved(page)).toEqual([]);
});

test("double-click edits in place; a single click only selects", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(60, 80).x, view.at(60, 80).y);
  await page.keyboard.type("Hello");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Hello", "created");

  // Click away (nothing selected), click the text once (selected, not editing), once more (still not editing).
  await page.mouse.click(view.at(400, 250).x, view.at(400, 250).y);
  const onText = view.at(75, 95);
  await page.mouse.click(onText.x, onText.y);
  await expect(page.getByRole("region", { name: "Font" })).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
  await page.waitForTimeout(500); // longer than a double-click interval
  await page.mouse.click(onText.x, onText.y);
  await expect(page.locator("textarea")).toHaveCount(0);

  // Double-click: editing in place. Type more and click elsewhere on the image to finish.
  await page.mouse.dblclick(onText.x, onText.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Control+a"); // select all and retype: the edit is in place, same box
  await page.keyboard.type("Hello world");
  await page.mouse.click(view.at(400, 250).x, view.at(400, 250).y);

  await expectSaved(page, ([t]) => t?.text === "Hello world", "the edit is saved");
  expect((await saved(page)).length).toBe(1);
  await expect(page.locator("textarea")).toHaveCount(0);
});

test("emptying a text keeps its words; Esc ends the edit", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(60, 80).x, view.at(60, 80).y);
  await page.keyboard.type("Keep me");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Keep me", "created");

  await page.mouse.dblclick(view.at(75, 95).x, view.at(75, 95).y);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1300);

  expect((await saved(page)).map((t) => t.text)).toEqual(["Keep me"]);
});

test("font size: typed, from the presets; bold, italic; the wrap handles leave the size alone", async ({ page }) => {
  await page.goto("/");
  await capture(page, 800, 300);
  const view = await atActualSize(page, 800);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(60, 60).x, view.at(60, 60).y);
  await page.keyboard.type("Wrap me at some width please");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Wrap me at some width please", "created");
  const [created] = await saved(page);
  expect(created!.width).toBe(240);

  // Typed size.
  const size = page.getByRole("spinbutton", { name: "Font size" });
  await size.fill("48");
  await expectSaved(page, ([t]) => t?.font.size === 48, "typed 48");
  // Out of range typing is ignored.
  await size.fill("500");
  await page.waitForTimeout(1300);
  expect((await saved(page))[0]!.font.size).toBe(48);
  // A preset.
  await page.getByRole("combobox", { name: "Font size presets" }).selectOption("32");
  await expectSaved(page, ([t]) => t?.font.size === 32, "preset 32");
  // Bold and italic, the color and the outline.
  await page.getByRole("button", { name: "Bold" }).click();
  await page.getByRole("button", { name: "Italic" }).click();
  await page.getByRole("button", { name: "Color #2563eb" }).first().click();
  await expectSaved(
    page,
    ([t]) => t?.font.bold === true && t.font.italic === true && t.font.color === "#2563eb",
    "bold, italic and blue",
  );
  await page.getByRole("checkbox", { name: "Outline" }).uncheck();
  await expectSaved(page, ([t]) => t?.textOutline.enabled === false, "outline off");
  await page.getByRole("checkbox", { name: "Outline" }).check();
  await page.getByRole("spinbutton", { name: "Outline width" }).fill("4");
  await expectSaved(page, ([t]) => t?.textOutline.enabled === true && t.textOutline.width === 4, "outline 4 px");

  // The right-hand handle changes the wrap width, not the font size.
  const before = (await saved(page))[0]!;
  const right = await rightHandle(page, view);
  await drag(page, right, { x: right.x + 150, y: right.y });
  await expectSaved(page, ([t]) => !!t && t.width > before.width + 100, "wider");
  const after = (await saved(page))[0]!;
  expect(after.font).toEqual(before.font);
  expect(close(after.x, before.x) && close(after.y, before.y)).toBe(true);
});

/**
 * Where the selected text's right-middle width handle is on screen. Fabric draws the selection box
 * (border #2f5bea, set in textShape.ts) and its handles on the canvas (lower: objects keep their stacking order), so the box is found by
 * scanning that canvas for the border color. Needs 100% zoom (one canvas pixel per Capture pixel).
 */
async function rightHandle(page: Page, view: { at(x: number, y: number): { x: number; y: number } }) {
  const box = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.lower-canvas") as HTMLCanvasElement;
    const { data, width, height } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        // Blue and not grey: the 1 px border is anti-aliased, so only its hue is reliable.
        if (data[i + 3]! > 80 && data[i + 2]! > data[i]! + 80 && data[i + 2]! > data[i + 1]! + 40) {
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    return { right, top, bottom };
  });
  expect(box.right).toBeGreaterThan(0);
  // The handle is a 12 px circle centred on the box edge, whose outline reaches 6 px beyond it.
  return view.at(box.right - 6, (box.top + box.bottom) / 2);
}

test("a reopened image keeps its text, and it is still editable", async ({ page }) => {
  await page.goto("/");
  await capture(page, 300, 200);
  const view = await mapper(page, 300);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(30, 40).x, view.at(30, 40).y);
  await page.keyboard.type("Persist");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Persist", "created");

  await page.reload();
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  const again = await mapper(page, 300);
  await page.mouse.dblclick(again.at(40, 50).x, again.at(40, 50).y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Persisted");
  await page.keyboard.press("Escape");

  await expectSaved(page, ([t]) => t?.text === "Persisted", "edited after the reopen");
  expect((await saved(page)).length).toBe(1);
});

test("the Export has the text burned in, pixel for pixel as on the canvas", async ({ page }) => {
  await page.goto("/");
  await capture(page, 500, 200);
  const view = await atActualSize(page, 500);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(40, 50).x, view.at(40, 50).y);
  await page.keyboard.type("Burned in");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Burned in", "created");
  await page.mouse.click(view.at(450, 180).x, view.at(450, 180).y); // deselect, so no handles are in the way

  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // let the deselect repaint
  // What the editor canvas shows, composited over the Capture's grey (the canvas itself is transparent).
  const onScreen = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.lower-canvas") as HTMLCanvasElement;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: Array.from(data) };
  });
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
  const png = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[0]!)));
  expect(hasChunk(png, "snAP")).toBe(false); // a plain PNG (ADR 0004)
  const { width, height, rgba } = decodePixels(png);
  expect([width, height]).toEqual([500, 200]);
  expect([onScreen.width, onScreen.height]).toEqual([500, 200]);

  let red = 0;
  let white = 0;
  let worst = 0;
  for (let i = 0; i < width * height; i++) {
    const a = onScreen.data[i * 4 + 3]! / 255;
    for (let c = 0; c < 3; c++) {
      const expected = Math.round(onScreen.data[i * 4 + c]! * a + 200 * (1 - a));
      worst = Math.max(worst, Math.abs(expected - rgba[i * 4 + c]!));
    }
    const [r, g, b] = [rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!];
    if (r === 224 && g === 36 && b === 36) red++;
    if (r === 255 && g === 255 && b === 255) white++;
  }
  expect(worst).toBeLessThanOrEqual(2); // the same adapter draws both
  // The pixel counts depend on the font (Segoe UI on the Windows runner is thinner than the Linux
  // fallback: 90 red pixels there), so only require that the letters and outline are clearly present.
  expect(red).toBeGreaterThan(30); // solid red letters (#e02424)
  expect(white).toBeGreaterThan(30); // and the white outline around them
  // The outline sits outside the letters: far from the text the Capture is untouched.
  expect(Array.from(rgba.slice((190 * width + 490) * 4, (190 * width + 490) * 4 + 4))).toEqual([200, 200, 200, 255]);
});

test("the outline is painted first with a doubled width (letters stay solid, outline reaches the full width outside)", async ({ page }) => {
  await page.goto("/");
  await capture(page, 300, 200);
  const view = await atActualSize(page, 300);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(40, 40).x, view.at(40, 40).y);
  await page.keyboard.type("I");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "I", "created");
  // A wide outline and large text make the geometry easy to measure.
  await page.getByRole("spinbutton", { name: "Font size" }).fill("100");
  await page.getByRole("spinbutton", { name: "Outline width" }).fill("10");
  await expectSaved(page, ([t]) => t?.font.size === 100 && t.textOutline.width === 10, "styled");
  await page.mouse.click(view.at(280, 180).x, view.at(280, 180).y);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
  const png = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[0]!)));
  const { width, rgba } = decodePixels(png);
  const rowOf = (y: number) => {
    const reds: number[] = [];
    const whites: number[] = [];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i] === 224 && rgba[i + 1] === 36 && rgba[i + 2] === 36) reds.push(x);
      if (rgba[i] === 255 && rgba[i + 1] === 255 && rgba[i + 2] === 255) whites.push(x);
    }
    return { reds, whites };
  };
  // Find a row through the middle of the stem of the "I" (the tallest part of the box).
  const stemRow = [...Array(200).keys()].map(rowOf).find((r, y) => y > 60 && r.reds.length > 3 && r.reds.length < 40)!;
  const red = stemRow.reds;
  const stemLeft = Math.min(...red);
  const stemRight = Math.max(...red);
  // The letter is solid red from edge to edge (the outline, painted first, never eats into it)...
  expect(red.length).toBe(stemRight - stemLeft + 1);
  // ...and the white outline reaches the full 10 px beyond each edge (a doubled stroke width, half covered).
  const whiteLeft = stemRow.whites.filter((x) => x < stemLeft);
  expect(stemLeft - Math.min(...whiteLeft)).toBeGreaterThanOrEqual(9);
  expect(stemLeft - Math.min(...whiteLeft)).toBeLessThanOrEqual(11);
});

test("clicking a Style panel control while typing keeps the typed words and applies the style", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 200);
  const view = await atActualSize(page, 400);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(40, 40).x, view.at(40, 40).y);
  await page.keyboard.type("Still typing");

  await page.getByRole("button", { name: "Bold" }).click(); // the box has not been left with Esc or a click on the image

  await expectSaved(page, ([t]) => t?.text === "Still typing" && t.font.bold === true, "words and style both saved");
  await expect(page.locator("textarea")).toHaveCount(0);
});

test("undo and redo a created text and an edited text; Delete, Backspace and Ctrl+Z inside the box are the text's", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(60, 80).x, view.at(60, 80).y);
  await page.keyboard.type("Hello");
  await page.keyboard.press("Backspace"); // inside the box: erases a letter, never deletes the Annotation
  await page.keyboard.press("Control+z"); // inside the box: the textarea's own undo, not the picture's
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text.startsWith("Hell") === true, "created, with the Backspace applied to the words");
  const created = (await saved(page))[0]!.text;

  await page.mouse.dblclick(view.at(75, 95).x, view.at(75, 95).y);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Edited");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Edited", "edited");

  await page.keyboard.press("Control+z"); // outside the box: the edit steps back
  await expectSaved(page, ([t]) => t?.text === created, "undo restores the earlier words");
  await page.keyboard.press("Control+y");
  await expectSaved(page, ([t]) => t?.text === "Edited", "redo");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z"); // and back past the creation: no text left
  await expectSaved(page, (texts) => texts.length === 0, "undo removes the created text");
  await page.keyboard.press("Control+y");
  await expectSaved(page, ([t]) => t?.text === created, "redo brings it back");
});

test("Ctrl view keys still work inside the text box, and Ctrl+C does not copy the image", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 200);
  const view = await atActualSize(page, 400);
  await page.keyboard.press("t");
  await page.mouse.click(view.at(40, 40).x, view.at(40, 40).y);
  await page.keyboard.type("abc");

  await page.keyboard.press("Control+0"); // Fit: a Ctrl view key stays active while typing
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+c");
  expect(await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(0);
});

// --- ticket 35: drag to define the area of the text box -------------------------------------------------

/** The saved box, to within the half pixel a pointer position can land on. */
function expectArea(text: Text | undefined, want: { x: number; y: number; width: number; minHeight?: number }) {
  expect(text).toBeDefined();
  expect(close(text!.x, want.x, 1) && close(text!.y, want.y, 1), `at ${text!.x},${text!.y}`).toBe(true);
  expect(close(text!.width, want.width, 1)).toBe(true);
  const minHeight = (text as { minHeight?: number }).minHeight;
  expect(want.minHeight === undefined ? minHeight === undefined : close(minHeight ?? -99, want.minHeight, 1)).toBe(true);
}

const LONG = "The quick brown fox jumps over the lazy dog again and again until the box grows";

/** Press, move in a few steps, but leave the button down (the caller releases or cancels). */
async function pressAndMove(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 3 });
}

/** Bounds of the red letters in the Export (the Copy button's PNG), or null if there are none. */
async function exportedRedBounds(page: Page, copiesBefore = 0) {
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  // A new copy, not an earlier one.
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBeGreaterThan(copiesBefore);
  const png = Uint8Array.from(
    await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!)),
  );
  const { width, height, rgba } = decodePixels(png);
  let box: { left: number; top: number; right: number; bottom: number } | null = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i] === 224 && rgba[i + 1] === 36 && rgba[i + 2] === 36) {
        box = box
          ? { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x), bottom: Math.max(box.bottom, y) }
          : { left: x, top: y, right: x, bottom: y };
      }
    }
  }
  return box;
}

/** True if any pixel in the rectangle of the editor canvas (Capture pixels) is not transparent. */
async function canvasHasInk(page: Page, x: number, y: number, w: number, h: number) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // let it repaint
  return page.evaluate(
    ({ x, y, w, h }) => {
      const canvas = document.querySelector("canvas.lower-canvas") as HTMLCanvasElement;
      const { data } = canvas.getContext("2d")!.getImageData(x, y, w, h);
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) return true;
      return false;
    },
    { x, y, w, h },
  );
}

test("Text: dragging draws a dashed area, then types in it, wrapping at the dragged width and growing past its height", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");

  await pressAndMove(page, view.at(60, 40), view.at(260, 100));
  // While the button is down: a live dashed outline along the top edge (nothing else is on the canvas).
  expect(await canvasHasInk(page, 100, 38, 120, 4)).toBe(true);
  await expect(page.locator("textarea")).toHaveCount(0);
  await page.mouse.up();

  // Released: typing starts at once (the dashed preview is replaced by the box itself).
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type(LONG);
  await page.keyboard.press("Escape");

  await expectSaved(page, ([t]) => t?.text === LONG, "typed text saved");
  const [text] = await saved(page);
  expectArea(text, { x: 60, y: 40, width: 200, minHeight: 60 });
  expect(text!.text).not.toContain("\n"); // wrapped softly, not with line breaks

  await page.mouse.click(view.at(580, 280).x, view.at(580, 280).y); // deselect: no handles in the Export
  const letters = await exportedRedBounds(page);
  expect(letters).not.toBeNull();
  // Wrapped at the dragged width: no letter beyond the right edge of the area (60 + 200 = 260)...
  expect(letters!.left).toBeGreaterThanOrEqual(58);
  expect(letters!.right).toBeLessThanOrEqual(262);
  // ...and grown downward well past the dragged height (40 + 60 = 100).
  expect(letters!.top).toBeGreaterThanOrEqual(38);
  expect(letters!.bottom).toBeGreaterThan(160);
});

test("Text: the dragged height is a minimum; a short text still fills the area, also after a reload, and the width stays", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");
  await drag(page, view.at(60, 40), view.at(260, 160));
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Hi", "created");
  expectArea((await saved(page))[0], { x: 60, y: 40, width: 200, minHeight: 120 });

  await page.reload();
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  const again = await mapper(page, 600);
  // Clicking low inside the area, far below the one line of text, still hits the box (it is 120 tall).
  await expect(page.getByRole("region", { name: "Font" })).toHaveCount(0);
  await page.mouse.click(again.at(150, 150).x, again.at(150, 150).y);
  await expect(page.getByRole("region", { name: "Font" })).toBeVisible();

  // Still editable, and the width and minimum height are what they were.
  await page.mouse.dblclick(again.at(150, 150).x, again.at(150, 150).y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" there, this goes on for a long while so it must wrap");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text.startsWith("Hi there") === true, "edited after the reload");
  expectArea((await saved(page))[0], { x: 60, y: 40, width: 200, minHeight: 120 });
});

test("Text: dragging up and left works like the Rectangle, and the area stays inside the Capture", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");
  await drag(page, view.at(260, 140), view.at(60, 40));
  await page.keyboard.type("Up");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Up", "created");
  expectArea((await saved(page))[0], { x: 60, y: 40, width: 200, minHeight: 100 });

  await page.keyboard.press("t");
  await drag(page, view.at(500, 200), view.at(900, 280)); // the pointer leaves the Capture to the right
  await page.keyboard.type("Edge");
  await page.keyboard.press("Escape");
  await expectSaved(page, (texts) => texts.length === 2, "second text created");
  const [, edge] = await saved(page);
  expectArea(edge, { x: 500, y: 200, width: 100, minHeight: 80 });
});

test("Text: a click without a drag still makes a default-width box, and so does a tiny drag", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");
  await page.mouse.move(view.at(40, 40).x, view.at(40, 40).y);
  await page.mouse.down();
  await page.mouse.move(view.at(42, 41).x, view.at(42, 41).y); // a shaky click: under 4 px
  await page.mouse.up();
  await page.keyboard.type("Click");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Click", "click created");
  const [clicked] = await saved(page);
  expectArea(clicked, { x: 40, y: 40, width: 240 });
  expect(clicked).not.toHaveProperty("minHeight");

  await page.keyboard.press("t");
  await drag(page, view.at(40, 150), view.at(48, 230)); // 8 px wide: a sliver, not an area
  await page.keyboard.type("Sliver");
  await page.keyboard.press("Escape");
  await expectSaved(page, (texts) => texts.length === 2, "tiny drag created");
  const [, sliver] = await saved(page);
  expectArea(sliver, { x: 40, y: 150, width: 240 });
  expect(sliver).not.toHaveProperty("minHeight");
});

test("Text: Esc during the drag cancels it, nothing is created", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");

  await pressAndMove(page, view.at(60, 40), view.at(260, 140));
  expect(await canvasHasInk(page, 100, 38, 120, 4)).toBe(true);
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(page.locator("textarea")).toHaveCount(0);
  expect(await canvasHasInk(page, 100, 38, 120, 4)).toBe(false); // the dashed area is gone
  await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(1300);
  expect(await saved(page)).toEqual([]);
});

test("Text set to keep drawing: drag out one box, click away, drag out another", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");
  await page.getByRole("checkbox", { name: "Return to Select after drawing" }).uncheck();

  await drag(page, view.at(40, 40), view.at(200, 90));
  await page.keyboard.type("One");
  await page.mouse.click(view.at(500, 250).x, view.at(500, 250).y); // clicking away ends the typing
  await expectSaved(page, (texts) => texts.length === 1, "first text created");
  await expect(page.getByRole("button", { name: /^Text/ })).toHaveAttribute("aria-pressed", "true");

  await drag(page, view.at(300, 150), view.at(500, 200));
  await page.keyboard.type("Two");
  await page.keyboard.press("Escape"); // Esc ends it and returns to Select, as always
  await expectSaved(page, (texts) => texts.length === 2, "second text created");
  expectArea((await saved(page))[1], { x: 300, y: 150, width: 200, minHeight: 50 });
});

// --- M3 testing notes: the drag preview, all eight handles, and alignment -----------------------------

test("Text: the live dashed area runs from the press to the pointer, in any direction, not out from the press point", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 300);
  const view = await atActualSize(page, 600);
  await page.keyboard.press("t");

  await pressAndMove(page, view.at(200, 120), view.at(320, 200));
  // On the area's top and left edges...
  expect(await canvasHasInk(page, 230, 118, 60, 4)).toBe(true);
  expect(await canvasHasInk(page, 198, 140, 4, 40)).toBe(true);
  // ...and nothing on the other side of the press point, where the old centred preview reached.
  expect(await canvasHasInk(page, 60, 60, 130, 120)).toBe(false);
  await page.keyboard.press("Escape"); // cancels the drag; nothing is made
  await page.mouse.up();

  // Up and to the left works the same way: the area is between the press and the pointer.
  await page.keyboard.press("t");
  await pressAndMove(page, view.at(400, 220), view.at(300, 160));
  expect(await canvasHasInk(page, 310, 158, 60, 4)).toBe(true);
  expect(await canvasHasInk(page, 410, 230, 150, 60)).toBe(false);
  await page.mouse.up();
  await expect(page.locator("textarea")).toBeFocused();
});

type Handle = "tl" | "mt" | "tr" | "ml" | "mr" | "bl" | "mb" | "br";
interface Box {
  x: number;
  y: number;
  width: number;
  minHeight?: number;
}

/** Where a handle is, from the saved model: a short text keeps the dragged height, so the box is x..x+width+4, y..y+minHeight+4 (4 px outline). */
function handlePoint(t: Box, name: Handle, view: { at(x: number, y: number): { x: number; y: number } }) {
  const pad = 4;
  const left = t.x;
  const right = t.x + t.width + pad;
  const top = t.y;
  const bottom = t.y + (t.minHeight ?? 30) + pad;
  const x = name.endsWith("l") ? left : name.endsWith("r") ? right : (left + right) / 2;
  const y = name === "mt" || name.startsWith("t") ? top : name === "mb" || name.startsWith("b") ? bottom : (top + bottom) / 2;
  return view.at(x, y);
}

test("Text: all eight handles resize or move the box and never change the font size", async ({ page }) => {
  await page.goto("/");
  await capture(page, 900, 500);
  const view = await atActualSize(page, 900);
  await page.keyboard.press("t");
  await pressAndMove(page, view.at(200, 150), view.at(500, 270)); // 300 x 120
  await page.mouse.up();
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Hi", "created");
  const first = (await saved(page))[0]! as Text & Box;
  expectArea(first, { x: 200, y: 150, width: 300, minHeight: 120 });

  async function dragHandle(name: Handle, dx: number, dy: number): Promise<Text & Box> {
    const before = (await saved(page))[0]! as Text & Box;
    const from = handlePoint(before, name, view);
    await drag(page, from, { x: from.x + dx, y: from.y + dy });
    await expectSaved(
      page,
      ([t]) => !!t && (Math.abs(t.x - before.x) > 5 || Math.abs(t.y - before.y) > 5 || Math.abs(t.width - before.width) > 5 || Math.abs(((t as Box).minHeight ?? 0) - (before.minHeight ?? 0)) > 5),
      `${name} moved the box`,
    );
    const after = (await saved(page))[0]! as Text & Box;
    expect(after.font, `${name} left the font alone`).toEqual(first.font);
    expect(after.text).toBe("Hi");
    return after;
  }
  const right = (t: Box) => t.x + t.width;
  const bottom = (t: Box) => t.y + (t.minHeight ?? 0);

  // Right and left sides: width changes; the opposite edge stays.
  let t = await dragHandle("mr", 80, 0);
  expect(close(t.width, 380)).toBe(true);
  expect(close(t.x, 200) && close(t.y, 150) && close(t.minHeight ?? 0, 120)).toBe(true);
  t = await dragHandle("ml", -60, 0);
  expect(close(t.x, 140) && close(right(t), 580)).toBe(true);
  // Bottom and top: the height changes; the top handle keeps the bottom edge.
  t = await dragHandle("mb", 0, 50);
  expect(close(t.minHeight ?? 0, 170) && close(t.y, 150)).toBe(true);
  t = await dragHandle("mt", 0, -40);
  expect(close(t.y, 110) && close(bottom(t), 320) && close(t.minHeight ?? 0, 210)).toBe(true);
  // Corners do both axes.
  t = await dragHandle("br", 30, 20);
  expect(close(right(t), 610) && close(bottom(t), 340) && close(t.x, 140) && close(t.y, 110)).toBe(true);
  t = await dragHandle("tl", -20, -10);
  expect(close(t.x, 120) && close(t.y, 100) && close(right(t), 610) && close(bottom(t), 340)).toBe(true);
  t = await dragHandle("tr", -40, 30);
  expect(close(t.x, 120) && close(right(t), 570) && close(bottom(t), 340) && close(t.y, 130)).toBe(true);
  t = await dragHandle("bl", 40, -30);
  expect(close(t.x, 160) && close(right(t), 570) && close(t.y, 130) && close(bottom(t), 310)).toBe(true);
});

test("Text: the handles also work when the picture is shown smaller than 100%", async ({ page }) => {
  await page.goto("/");
  await capture(page, 1600, 900); // wider than the window: shown fitted
  const fitted = await mapper(page, 1600);
  expect(fitted.scale).toBeLessThan(0.9);
  await page.keyboard.press("t");
  await pressAndMove(page, fitted.at(300, 200), fitted.at(700, 320));
  await page.mouse.up();
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Hi", "created");

  const before = (await saved(page))[0]! as Text & Box;
  const from = handlePoint(before, "br", fitted);
  await drag(page, from, { x: from.x + 100 * fitted.scale, y: from.y + 60 * fitted.scale });
  await expectSaved(page, ([t]) => !!t && t.width > before.width + 60, "the corner resized it at a fitted zoom");
  const after = (await saved(page))[0]! as Text & Box;
  expect(close(after.width, before.width + 100, 4)).toBe(true);
  expect(close(after.minHeight ?? 0, (before.minHeight ?? 0) + 60, 4)).toBe(true);
  expect(close(after.x, before.x) && close(after.y, before.y)).toBe(true);
});

test("Text: a box cannot be dragged narrower than a few letters or flipped over", async ({ page }) => {
  await page.goto("/");
  await capture(page, 900, 500);
  const view = await atActualSize(page, 900);
  await page.keyboard.press("t");
  await pressAndMove(page, view.at(200, 150), view.at(400, 230));
  await page.mouse.up();
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Hi", "created");
  const before = (await saved(page))[0]! as Text & Box;
  const from = handlePoint(before, "mr", view);
  await drag(page, from, { x: from.x - 400, y: from.y }); // far past the left edge
  await expectSaved(page, ([t]) => !!t && t.width < before.width - 100, "narrowed");
  const after = (await saved(page))[0]! as Text & Box;
  expect(after.width).toBeGreaterThanOrEqual(20);
  expect(close(after.x, before.x)).toBe(true);
});

test("Text: alignment left, centre and right moves the lines inside the box, in the canvas and in the Export", async ({ page }) => {
  await page.goto("/");
  await capture(page, 700, 300);
  const view = await atActualSize(page, 700);
  await page.keyboard.press("t");
  await pressAndMove(page, view.at(100, 80), view.at(600, 160)); // a 500 wide box
  await page.mouse.up();
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expectSaved(page, ([t]) => t?.text === "Hi", "created");
  expect(((await saved(page))[0] as Text).font).toMatchObject({ align: "left" });

  const inkOf = async () => {
    await page.mouse.click(view.at(650, 280).x, view.at(650, 280).y); // deselect: no handles in the picture
    const copies = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
    const b = await exportedRedBounds(page, copies);
    await page.mouse.click(view.at(110, 90).x, view.at(110, 90).y); // select it again
    return b!;
  };
  const left = await inkOf();
  expect(left.left).toBeLessThan(140); // by the left edge (100)

  await page.getByRole("button", { name: "Align center" }).click();
  await expectSaved(page, ([t]) => t?.font.align === "center", "centre saved");
  const centre = await inkOf();
  expect(centre.left).toBeGreaterThan(300);
  expect(centre.right).toBeLessThan(400); // around the middle (350)

  await page.getByRole("button", { name: "Align right" }).click();
  await expectSaved(page, ([t]) => t?.font.align === "right", "right saved");
  const right = await inkOf();
  expect(right.right).toBeGreaterThan(560); // by the right edge (600)
  expect(right.left).toBeGreaterThan(centre.left);

  // The choice shows as pressed, sticks for the next text, and survives a reload.
  await expect(page.getByRole("button", { name: "Align right" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Align left" })).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await page.mouse.click(view.at(590, 100).x, view.at(590, 100).y);
  expect(((await saved(page))[0] as Text).font.align).toBe("right");
});
