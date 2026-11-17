import { expect, type Page, test } from "@playwright/test";

// Typing, clicking and Ctrl+U on a Text box with a vertical alignment, in real Chromium with the real Fabric
// canvas and the fake bridge. The model is read back by decoding the auto-saved Library PNG.

interface SavedText {
  type: string;
  text: string;
  x: number;
  y: number;
  width: number;
  minHeight?: number;
  font: { underline?: boolean; valign?: string; align?: string };
}
type InPage = {
  __fakeBridge: {
    simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
    libraryFiles: { path: string; bytes: Uint8Array }[];
  };
};

test.use({ viewport: { width: 1100, height: 760 } });

async function openCapture(page: Page, width: number, height: number) {
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge)); // the app installs the fake bridge a moment after load
  await page.goto("/");
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

const savedTexts = (page: Page): Promise<SavedText[]> =>
  page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });

async function dragOut(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test("a new box is Middle: typing works in it, and the caret moves between its lines", async ({ page }) => {
  const view = await openCapture(page, 600, 400);
  await page.keyboard.press("t");
  await dragOut(page, view.at(100, 100), view.at(300, 260)); // 200 x 160
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type("aaa");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bbb");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedTexts(page))[0]?.text).toBe("aaa\nbbb");
  const [made] = await savedTexts(page);
  expect(made!.font).toMatchObject({ valign: "middle", underline: false });
  expect(made!.minHeight).toBeGreaterThan(150);

  // Double-click to edit (the caret goes to the end), then move up a line with the keyboard and type there.
  const word = view.at(115, 165);
  await page.mouse.dblclick(word.x, word.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("X");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedTexts(page))[0]?.text).toBe("aaaX\nbbb");
});

test("Ctrl+U underlines the whole text while typing, and again on a saved box, with no tool change", async ({ page }) => {
  const view = await openCapture(page, 600, 300);
  await page.keyboard.press("t");
  const at = view.at(60, 80);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.type("Hi there");
  await page.keyboard.press("Control+u");
  await expect(page.getByRole("button", { name: /^Text/ })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedTexts(page))[0]?.font.underline).toBe(true);
  await expect(page.getByRole("button", { name: "Underline" })).toHaveAttribute("aria-pressed", "true");

  // Edit it again and switch the underline off: nothing else changes, and it is still saved.
  const [t] = await savedTexts(page);
  const onText = view.at(t!.x + 20, t!.y + 12);
  await page.mouse.dblclick(onText.x, onText.y);
  await expect(page.locator("textarea")).toBeFocused();
  await page.keyboard.press("Control+u");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedTexts(page))[0]?.font.underline).toBe(false);
  expect((await savedTexts(page))[0]!.text).toBe("Hi there");
  await expect(page.getByRole("button", { name: "Underline" })).toHaveAttribute("aria-pressed", "false");
});

test("the U and the vertical alignment buttons restyle a selected box", async ({ page }) => {
  const view = await openCapture(page, 600, 300);
  await page.keyboard.press("t");
  await dragOut(page, view.at(100, 60), view.at(300, 200));
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await savedTexts(page))[0]?.text).toBe("Hi");

  await page.getByRole("button", { name: "Align bottom" }).click();
  await page.getByRole("button", { name: "Underline" }).click();
  await expect.poll(async () => (await savedTexts(page))[0]?.font).toMatchObject({ valign: "bottom", underline: true });
});
