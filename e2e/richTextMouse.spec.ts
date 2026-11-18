import { expect, type Page, test } from "@playwright/test";

// Regression: "I am not able to select any text to differentiate; I can only apply changes to the text box in
// general" (real Windows WebView2). Cause: a press on the text being typed in (to drag-select, or to put the caret)
// took the focus off Fabric's hidden textarea, and the textarea's blur ended the edit, so the Font controls then
// restyled the whole selected box. These tests use only what a person does: real mouse presses, drags and
// double-clicks on the text, and real clicks on the Font controls (no calls into the canvas, no key-only selection).

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

async function openCapture(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
  await page.evaluate(() => {
    const rgba = new Uint8Array(600 * 300 * 4).fill(255);
    (window as unknown as InPage).__fakeBridge.simulateCapture({ width: 600, height: 300, rgba, capturedAt: new Date() });
  });
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

const editing = (page: Page) => page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
const font = (page: Page) => page.getByRole("region", { name: "Font" });

/** A box with `words`, typed with the keyboard, then left (Esc) and opened again by a real double-click: where a user starts. */
async function openForEdit(page: Page, view: { at(x: number, y: number): { x: number; y: number } }, words: string, key = "t") {
  await page.keyboard.press(key);
  const at = view.at(60, 80);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type(words);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page))[0]?.text).toBe(words);
  const [box] = await saved(page);
  const text = view.at(box!.x + 10, box!.y + 12);
  await page.mouse.dblclick(text.x, text.y);
  await expect(page.locator("textarea")).toBeFocused();
  return { box: box!, point: (dx: number) => view.at(box!.x + dx, box!.y + 12) };
}

test("dragging over text with the mouse selects it, and Bold then styles only that selection", async ({ page }) => {
  const view = await openCapture(page);
  const { point } = await openForEdit(page, view, "Hello world");
  const from = point(1);
  const to = point(46);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  expect(await editing(page)).toBe(true); // the drag did not end the edit
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false"); // a selection is read, not the box

  await page.getByRole("button", { name: "Bold" }).click(); // a real click on the toolbar
  expect(await editing(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  const [box] = await saved(page);
  expect(box!.font.bold).toBe(false); // the box itself is not bold
  const [run] = box!.runs!;
  expect(run!.from).toBe(0);
  expect(run!.to).toBeGreaterThan(0);
  expect(run!.to).toBeLessThan(11);
  expect(run!.font).toEqual({ bold: true });
});

test("double-clicking a word selects it; a size, a colour and Underline from the toolbar change that word only", async ({ page }) => {
  const view = await openCapture(page);
  const { point } = await openForEdit(page, view, "Hello world");
  const word = point(100); // inside "world"
  await page.mouse.dblclick(word.x, word.y);
  expect(await editing(page)).toBe(true);

  await font(page).getByLabel("Font size presets").selectOption("48");
  expect(await editing(page)).toBe(true);
  await font(page).getByRole("button", { name: "Color #16a34a" }).click();
  await page.getByRole("button", { name: "Underline" }).click();
  expect(await editing(page)).toBe(true);
  await page.keyboard.press("Escape");

  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  const [box] = await saved(page);
  expect(box!.font).toMatchObject({ size: 24, color: "#e02424", bold: false, underline: false });
  expect(box!.runs).toEqual([{ from: 6, to: 11, font: { size: 48, color: "#16a34a", underline: true } }]);
});

test("a press on text being typed in moves the caret and keeps the edit; with only a caret the whole box changes", async ({ page }) => {
  const view = await openCapture(page);
  const { point } = await openForEdit(page, view, "Hello world");
  const p = point(2); // before the first letter
  await page.mouse.click(p.x, p.y);
  expect(await editing(page)).toBe(true);
  await page.keyboard.type("X");
  await expect.poll(async () => page.evaluate(() => document.querySelector("textarea")?.value)).toBe("XHello world");

  await page.getByRole("button", { name: "Bold" }).click(); // caret only: the whole box
  expect(await editing(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page))[0]?.font.bold).toBe(true);
  expect((await saved(page))[0]!.runs).toBeUndefined();
  expect((await saved(page))[0]!.text).toBe("XHello world");
});

test("pressing on the Font section between its controls keeps the edit and the selection", async ({ page }) => {
  const view = await openCapture(page);
  const { point } = await openForEdit(page, view, "Hello world");
  const word = point(100);
  await page.mouse.dblclick(word.x, word.y);
  const heading = await font(page).getByRole("heading", { name: "Font" }).boundingBox();
  await page.mouse.click(heading!.x + heading!.width - 10, heading!.y + heading!.height / 2); // empty space of the section
  expect(await editing(page)).toBe(true);
  await page.getByRole("button", { name: "Italic" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  expect(await savedRuns(page)).toEqual([{ from: 6, to: 11, font: { italic: true } }]);
});

test("a hex colour typed for the selection applies to it only, and the size field takes the selection back", async ({ page }) => {
  const view = await openCapture(page);
  const { point } = await openForEdit(page, view, "Hello world");
  const word = point(100);
  await page.mouse.dblclick(word.x, word.y);
  const hex = page.getByRole("textbox", { name: "Text color hex" });
  await hex.click();
  await hex.fill("#2563eb");
  await hex.press("Enter");
  const size = page.getByRole("spinbutton", { name: "Font size" });
  await size.click();
  await size.fill("40");
  await expect(size).toHaveValue("40");
  await page.mouse.click(view.at(300, 250).x, view.at(300, 250).y); // empty canvas: ends the edit
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  expect(await savedRuns(page)).toEqual([{ from: 6, to: 11, font: { size: 40, color: "#2563eb" } }]);
  expect((await saved(page))[0]!.font).toMatchObject({ size: 24, color: "#e02424" });
});

test("a Callout: mouse selection and a toolbar click style the selection only", async ({ page }) => {
  const view = await openCapture(page);
  const { point } = await openForEdit(page, view, "Look here", "o");
  const word = point(80); // inside "here"
  await page.mouse.dblclick(word.x, word.y);
  expect(await editing(page)).toBe(true);
  await page.getByRole("button", { name: "Bold" }).click();
  await page.getByRole("region", { name: "Font" }).getByRole("button", { name: "Color #2563eb" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedRuns(page))?.length).toBe(1);
  const [box] = await saved(page);
  expect(box!.type).toBe("callout");
  expect(box!.font).toMatchObject({ bold: false, color: "#e02424" });
  expect(box!.runs).toEqual([{ from: 5, to: 9, font: { bold: true, color: "#2563eb" } }]);
});
