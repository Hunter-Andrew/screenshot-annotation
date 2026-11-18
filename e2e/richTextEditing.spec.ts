import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";
import { liveArea } from "./liveCanvas";

// Styling part of the text in a Text or Callout box, in real Chromium with the real Fabric canvas and the fake
// bridge: the user types, selects characters, uses the Style panel or Ctrl+B/I/U. The model is read back by
// decoding the auto-saved Library PNG, whose visible pixels are the finished image.

interface Run {
  from: number;
  to: number;
  font: Record<string, unknown>;
}
interface SavedBox {
  type: string;
  text: string;
  x: number;
  y: number;
  runs?: Run[];
  font: { size: number; bold: boolean; italic: boolean; underline?: boolean; color: string };
}
type InPage = {
  __fakeBridge: {
    simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
    libraryFiles: { path: string; bytes: Uint8Array }[];
  };
};

test.use({ viewport: { width: 1100, height: 760 } });

async function openCapture(page: Page, width = 600, height = 300) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4).fill(255);
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width, height },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  const stage = (await page.locator(".stage").boundingBox())!;
  return { at: (x: number, y: number) => ({ x: stage.x + x, y: stage.y + y }) };
}

const saved = (page: Page): Promise<SavedBox[]> =>
  page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });

const savedRuns = async (page: Page) => (await saved(page))[0]?.runs;

/** A new Text with `words` typed in, the caret at the end, the edit still going. */
async function typeText(page: Page, view: { at(x: number, y: number): { x: number; y: number } }, words: string, key = "t") {
  await page.keyboard.press(key);
  const at = view.at(60, 80);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type(words);
}

/** Fabric's Home with a selection only collapses it to its start, so press it twice to be at the start of the line. */
const home = async (page: Page) => {
  await page.keyboard.press("Home");
  await page.keyboard.press("Home");
};

/** Select characters from..to of a single-line text: Home, then Shift+Right. */
async function select(page: Page, from: number, to: number) {
  await home(page);
  for (let i = 0; i < from; i++) await page.keyboard.press("ArrowRight");
  for (let i = from; i < to; i++) await page.keyboard.press("Shift+ArrowRight");
}

const bold = (page: Page) => page.getByRole("button", { name: "Bold" });

test("Bold on selected characters bolds only them: the edit and the selection stay, the box keeps its own style", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 0, 5);
  await expect(bold(page)).toHaveAttribute("aria-pressed", "false");

  await bold(page).click();
  // Still typing, with the same selection: the keyboard goes on working in the text.
  await expect(page.locator("textarea")).toBeFocused();
  await expect(bold(page)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type("J"); // replaces the selection
  await page.keyboard.press("Escape");

  await expect.poll(async () => (await saved(page))[0]?.text).toBe("J world");
  const [box] = await saved(page);
  expect(box!.font.bold).toBe(false);
  expect(box!.runs).toEqual([{ from: 0, to: 1, font: { bold: true } }]); // typing over a selection takes the first letter's style
});

test("a styled range stays on its characters when text is typed or deleted before it", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "abcdef");
  await select(page, 2, 4);
  await bold(page).click();
  await home(page);
  await page.keyboard.type("XY");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page))[0]?.text).toBe("XYabcdef");
  expect(await savedRuns(page)).toEqual([{ from: 4, to: 6, font: { bold: true } }]);

  // And back: delete "XY" and the range returns to where it was.
  const [box] = await saved(page);
  const onText = view.at(box!.x + 30, box!.y + 12);
  await page.mouse.dblclick(onText.x, onText.y);
  await expect(page.locator("textarea")).toBeFocused();
  await home(page);
  await page.keyboard.press("Delete");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page))[0]?.text).toBe("abcdef");
  expect(await savedRuns(page)).toEqual([{ from: 2, to: 4, font: { bold: true } }]);
});

test("Ctrl+B, Ctrl+I and Ctrl+U style the selection, and pressing Ctrl+B again takes it off (nothing is stored)", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 6, 11);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+i");
  await page.keyboard.press("Control+u");
  await expect(bold(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Underline" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  expect(await savedRuns(page)).toEqual([{ from: 6, to: 11, font: { bold: true, italic: true, underline: true } }]);
  expect((await saved(page))[0]!.font).toMatchObject({ bold: false, italic: false, underline: false });

  // The same selection again: Ctrl+B, Ctrl+I and Ctrl+U off.
  const [box] = await saved(page);
  const at = view.at(box!.x + 12, box!.y + 12);
  await page.mouse.dblclick(at.x, at.y);
  await expect(page.locator("textarea")).toBeFocused();
  await select(page, 6, 11);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+i");
  await page.keyboard.press("Control+u");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page))[0]?.runs).toBeUndefined();
  expect((await saved(page))[0]!.text).toBe("Hello world");
});

test("with a caret only, Ctrl+B and the Bold button make the whole box bold and drop the bold of its characters", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 0, 5);
  await bold(page).click();
  await page.keyboard.press("End"); // a caret only
  await expect(bold(page)).toHaveAttribute("aria-pressed", "false"); // the box itself is not bold

  await bold(page).click(); // whole box
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page))[0]?.font.bold).toBe(true);
  expect((await saved(page))[0]!.runs).toBeUndefined();
});

test("with a caret only, a color for the whole box takes the colors of the characters off, as it says; their other styles stay", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 0, 5);
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #2563eb" }).click();
  await bold(page).click();
  await page.keyboard.press("End");
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #16a34a" }).click();
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page))[0]?.font.color).toBe("#16a34a");
  expect(await savedRuns(page)).toEqual([{ from: 0, to: 5, font: { bold: true } }]);
});

test("a font size and a color for the selection: the box's own size and color stay, and a bigger run makes its line taller", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 6, 11);
  const area = page.getByRole("region", { name: "Font" });
  await area.getByLabel("Font size presets").selectOption("48");
  await expect(page.locator("textarea")).toBeFocused();
  await area.getByRole("button", { name: "Color #16a34a" }).click();
  await page.keyboard.press("Escape");

  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  expect(await savedRuns(page)).toEqual([{ from: 6, to: 11, font: { size: 48, color: "#16a34a" } }]);
  expect((await saved(page))[0]!.font).toMatchObject({ size: 24, color: "#e02424" });

  // The live canvas shows green letters, and the finished (Library) image has the same green.
  const live = await liveArea(page);
  const green = (rgba: number[]) => {
    let n = 0;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 1]! > 130 && rgba[i]! < 80 && rgba[i + 2]! < 120) n++;
    return n;
  };
  expect(green(live!.data)).toBeGreaterThan(50);
  const png = await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.libraryFiles.at(-1)!.bytes));
  expect(green(decodePixels(Uint8Array.from(png)).rgba)).toBeGreaterThan(50);
});

test("a size typed into the size box keeps the edit and the selection (the box does not lose the focus to the end of the edit)", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 0, 5);
  const size = page.getByRole("spinbutton", { name: "Font size" });
  await size.click();
  await size.fill("40");
  await expect(size).toHaveValue("40");
  // Done with the box: back to the text, the edit is still going.
  await page.keyboard.press("Tab");
  await page.locator(".canvas-container").first().click({ position: { x: 5, y: 5 } }); // empty space: ends the edit
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  expect(await savedRuns(page)).toEqual([{ from: 0, to: 5, font: { size: 40 } }]);
});

test("the panel shows mixed when the selection holds different values, then the common value once it is narrowed", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 0, 5);
  await bold(page).click();
  await select(page, 3, 8); // "lo wo": bold and not bold
  await expect(bold(page)).toHaveAttribute("aria-pressed", "mixed");
  await select(page, 1, 4); // "ell": all bold
  await expect(bold(page)).toHaveAttribute("aria-pressed", "true");
  await select(page, 6, 9); // "wor": none
  await expect(bold(page)).toHaveAttribute("aria-pressed", "false");

  await select(page, 0, 11);
  await page.getByRole("region", { name: "Font" }).getByLabel("Font size presets").selectOption("10");
  await select(page, 2, 4);
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #2563eb" }).click();
  await select(page, 0, 6);
  await expect(page.getByRole("spinbutton", { name: "Font size" })).toHaveValue("10");
  await expect(page.getByRole("textbox", { name: "Text color hex" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Text color hex" })).toHaveAttribute("placeholder", "mixed");
});

test("a Callout styles its selection the same way", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Look here", "o");
  await select(page, 5, 9);
  await page.keyboard.press("Control+b");
  await page.getByRole("button", { name: "Italic" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  const [box] = await saved(page);
  expect(box!.type).toBe("callout");
  expect(box!.runs).toEqual([{ from: 5, to: 9, font: { bold: true, italic: true } }]);
  expect(box!.font).toMatchObject({ bold: false, italic: false });
});

test("styling is one undo step with the edit, and Undo takes it all back (also for a box edited again later)", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 0, 5);
  await bold(page).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);

  // Edit again: color the other word, in one more step.
  const [box] = await saved(page);
  const at = view.at(box!.x + 20, box!.y + 12);
  await page.mouse.dblclick(at.x, at.y);
  await select(page, 6, 11);
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #2563eb" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(2);

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  expect(await savedRuns(page)).toEqual([{ from: 0, to: 5, font: { bold: true } }]);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await saved(page)).length).toBe(0); // the creation of the box itself
  await page.keyboard.press("Control+Shift+z");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(2);
});

test("a whole-box change from the panel, on a selected box that is not being typed in, resets what it changes", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await select(page, 0, 5);
  await bold(page).click();
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #2563eb" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  expect(await savedRuns(page)).toEqual([{ from: 0, to: 5, font: { bold: true, color: "#2563eb" } }]);

  // The box is selected, not typed in: the panel shows its own values and changes all of it.
  await expect(bold(page)).toHaveAttribute("aria-pressed", "false");
  await bold(page).click();
  await expect.poll(async () => (await saved(page))[0]?.font.bold).toBe(true);
  expect(await savedRuns(page)).toEqual([{ from: 0, to: 5, font: { color: "#2563eb" } }]);
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #16a34a" }).click();
  await expect.poll(async () => (await saved(page))[0]?.font.color).toBe("#16a34a");
  expect(await savedRuns(page)).toBeUndefined();
});

test("a new box typed in: the Font controls with a caret restyle it live, and a selection restyles only itself", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello world");
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #16a34a" }).click(); // caret only
  await expect(page.locator("textarea")).toBeFocused();
  await select(page, 0, 5);
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #2563eb" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page))[0]?.text).toBe("Hello world");
  const [box] = await saved(page);
  expect(box!.font.color).toBe("#16a34a");
  expect(box!.runs).toEqual([{ from: 0, to: 5, font: { color: "#2563eb" } }]);
});

test("a line with a bigger run is taller, and the box grows with it", async ({ page }) => {
  const view = await openCapture(page);
  await typeText(page, view, "Hello");
  const heightBefore = await page.evaluate(() => document.querySelector<HTMLCanvasElement>("canvas.upper-canvas")!.height);
  void heightBefore;
  await select(page, 0, 5);
  await page.getByRole("region", { name: "Font" }).getByLabel("Font size presets").selectOption("72");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  // The selection box (visible handles) is taller than a 24 px line: read it from the canvas object through the page.
  const box = await page.evaluate(() => {
    const el = document.querySelector<HTMLCanvasElement>("canvas.lower-canvas")!;
    return el.height;
  });
  expect(box).toBeGreaterThan(0);
  const live = await liveArea(page);
  let top = live!.height;
  let bottom = 0;
  for (let y = 0; y < live!.height; y++)
    for (let x = 0; x < live!.width; x++) {
      const i = (y * live!.width + x) * 4;
      if (live!.data[i]! > 150 && live!.data[i + 1]! < 90 && live!.data[i + 2]! < 90) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  expect(bottom - top).toBeGreaterThan(40); // 72 px letters, not 24 px ones
});
