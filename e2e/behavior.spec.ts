import { expect, type Page, test } from "@playwright/test";

// "Return to Select after drawing", per tool, in real Chromium with the real Fabric canvas and the fake
// platform bridge (browser storage keeps the settings across a reload). Also: the tool column's icons.

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
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

async function savedTypes(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as { type: string }[]).map((a) => a.type) : [];
  });
}

async function expectSaved(page: Page, types: string[]) {
  await expect.poll(() => savedTypes(page), { timeout: 6000, intervals: [200] }).toEqual(types);
}

async function mapper(page: Page, width: number) {
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

const tool = (page: Page, name: RegExp) => page.getByRole("button", { name });
const option = (page: Page) => page.getByRole("checkbox", { name: "Return to Select after drawing" });

test.use({ viewport: { width: 760, height: 520 } });

test("the Pen keeps drawing, a Rectangle returns to Select; each is switchable and remembered across a reload", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 400);
  const at = await mapper(page, 600);

  // Pen: two strokes without picking the tool again.
  await page.keyboard.press("p");
  await expect(option(page)).not.toBeChecked();
  await drag(page, at(60, 60), at(260, 120));
  await expectSaved(page, ["pen"]);
  await expect(tool(page, /^Pen \(P\)/)).toHaveAttribute("aria-pressed", "true");
  await drag(page, at(60, 160), at(260, 220));
  await expectSaved(page, ["pen", "pen"]);
  await expect(tool(page, /^Pen \(P\)/)).toHaveAttribute("aria-pressed", "true");

  // Rectangle: back to Select after one.
  await page.keyboard.press("r");
  await expect(option(page)).toBeChecked();
  await drag(page, at(320, 60), at(440, 140));
  await expectSaved(page, ["pen", "pen", "rect"]);
  await expect(tool(page, /^Select/)).toHaveAttribute("aria-pressed", "true");
  await expect(option(page)).toHaveCount(0); // about the tool: not offered for the selected rectangle

  // Flip both: the Rectangle now stays, the Pen now returns.
  await page.keyboard.press("r");
  await option(page).uncheck();
  await page.keyboard.press("p");
  await option(page).check();
  await page.keyboard.press("r");
  await expect(option(page)).not.toBeChecked();
  await drag(page, at(320, 200), at(440, 280));
  await expectSaved(page, ["pen", "pen", "rect", "rect"]);
  await expect(tool(page, /^Rectangle/)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("p");
  await expect(option(page)).toBeChecked();
  await drag(page, at(60, 300), at(260, 360));
  await expectSaved(page, ["pen", "pen", "rect", "rect", "pen"]);
  await expect(tool(page, /^Select/)).toHaveAttribute("aria-pressed", "true");

  // Esc still returns to Select while a staying tool is active.
  await page.keyboard.press("r");
  await page.keyboard.press("Escape");
  await expect(tool(page, /^Select/)).toHaveAttribute("aria-pressed", "true");

  // Restart: remembered (the settings are written after a short pause).
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await page.keyboard.press("p");
  await expect(option(page)).toBeChecked();
  await page.keyboard.press("r");
  await expect(option(page)).not.toBeChecked();
  await page.keyboard.press("a"); // untouched tool: its default
  await expect(option(page)).toBeChecked();
});

test("every tool button shows an icon, its name and its key, and keeps its accessible name", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 300);
  const nav = page.getByRole("navigation", { name: "Tools" });
  const expected: [string, string][] = [
    ["Select", "V"],
    ["Arrow", "A"],
    ["Line", "L"],
    ["Rectangle", "R"],
    ["Ellipse", "E"],
    ["Text", "T"],
    ["Pen", "P"],
  ];
  for (const [name, key] of expected) {
    const button = nav.getByRole("button", { name: `${name} (${key})`, exact: true });
    await expect(button).toHaveAttribute("title", `${name} (${key})`);
    await expect(button.locator("svg")).toHaveCount(1);
    const box = (await button.locator("svg").boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(20);
    expect(box.width).toBeLessThanOrEqual(24);
    await expect(button.locator("kbd")).toHaveText(key);
    await expect(button).toContainText(name);
  }
  await page.keyboard.press("e");
  await expect(nav.getByRole("button", { name: "Ellipse (E)" })).toHaveAttribute("aria-pressed", "true");
  await expect(nav.getByRole("button", { pressed: true })).toHaveCount(1);
});
