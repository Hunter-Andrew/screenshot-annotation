import { expect, test, type Page } from "@playwright/test";

// Drawing mode overlay (ticket 52) in the browser build, with the fake bridge: the page a real drawing
// window loads at `#drawing/<monitor>`. The viewport is 1280x720 at scale 1, so CSS and physical pixels agree.

type Rgba = [number, number, number, number];
const pixel = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=drawing-canvas]")!;
      return Array.from(canvas.getContext("2d")!.getImageData(px, py, 1, 1).data) as Rgba;
    },
    [x, y],
  );
const canvas = (page: Page) => page.getByTestId("drawing-canvas");
const count = async (page: Page) => Number(await canvas(page).getAttribute("data-drawings"));

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  await page.mouse.move(...to);
  await page.mouse.up();
}

const STYLES = {
  arrow: { stroke: { color: "#0000ff", width: 10 }, arrowheads: { ends: "end" } },
  rect: { stroke: { color: "#00ff00", width: 8 }, fill: { mode: "none", color: "#ffff00", opacity: 0.4 } },
  pen: { stroke: { color: "#ff00ff", width: 10 }, eraser: { mode: "pen", size: 20 } },
  highlight: { stroke: { color: "#ffff00", width: 30 }, opacity: { value: 0.5 } },
};

test.beforeEach(async ({ page }) => {
  // The editor's saved tool styles, as the editor writes them to settings.json (the fake keeps them in localStorage).
  await page.addInitScript((styles) => localStorage.setItem("fake.toolStyles", JSON.stringify(styles)), STYLES);
  await page.goto("/#drawing/0");
  await expect(canvas(page)).toBeVisible();
});

test("starts on Arrow with nothing drawn, over a transparent page", async ({ page }) => {
  await expect(canvas(page)).toHaveAttribute("data-tool", "arrow");
  expect(await count(page)).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
});

test("each tool draws with the editor's saved style for it", async ({ page }) => {
  // Arrow (the default): blue, 10 px, where the pointer went.
  await drag(page, [100, 100], [400, 100]);
  expect(await pixel(page, 200, 100)).toEqual([0, 0, 255, 255]);
  // Rectangle: green outline, no fill.
  await page.keyboard.press("r");
  await drag(page, [100, 200], [400, 300]);
  expect(await pixel(page, 250, 200)).toEqual([0, 255, 0, 255]);
  expect(await pixel(page, 250, 250)).toEqual([0, 0, 0, 0]);
  // Pen: magenta, 10 px.
  await page.keyboard.press("p");
  await drag(page, [100, 400], [400, 400]);
  expect(await pixel(page, 250, 400)).toEqual([255, 0, 255, 255]);
  // Highlighter: yellow, translucent (alpha is the stored 50%).
  await page.keyboard.press("h");
  await drag(page, [100, 500], [400, 500]);
  const [r, g, b, a] = await pixel(page, 250, 500);
  expect([r, g, b]).toEqual([255, 255, 0]);
  expect(a).toBeGreaterThan(110);
  expect(a).toBeLessThan(145);
  expect(await count(page)).toBe(4);
});

test("Ctrl+Z undoes and Ctrl+Y redoes", async ({ page }) => {
  await drag(page, [100, 100], [400, 100]);
  await page.keyboard.press("r");
  await drag(page, [100, 200], [400, 300]);
  expect(await count(page)).toBe(2);
  await page.keyboard.press("Control+z");
  expect(await count(page)).toBe(1);
  expect(await pixel(page, 250, 200)).toEqual([0, 0, 0, 0]);
  expect(await pixel(page, 200, 100)).toEqual([0, 0, 255, 255]);
  await page.keyboard.press("Control+y");
  expect(await count(page)).toBe(2);
  expect(await pixel(page, 250, 200)).toEqual([0, 255, 0, 255]);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  expect(await count(page)).toBe(0);
});

test("a new drawing after an undo forgets what could be redone", async ({ page }) => {
  await drag(page, [100, 100], [400, 100]);
  await page.keyboard.press("Control+z");
  await drag(page, [100, 300], [400, 300]);
  await page.keyboard.press("Control+y");
  expect(await count(page)).toBe(1);
});

test("Esc clears everything and asks the platform to leave the mode", async ({ page }) => {
  await drag(page, [100, 100], [400, 100]);
  await page.keyboard.press("p");
  await drag(page, [100, 300], [400, 300]);
  expect(await count(page)).toBe(2);
  await page.keyboard.press("Escape");
  expect(await count(page)).toBe(0);
  await expect(canvas(page)).toHaveAttribute("data-tool", "arrow");
  expect(await pixel(page, 200, 100)).toEqual([0, 0, 0, 0]);
  expect(await page.evaluate(() => (window as unknown as { __fakeBridge: { drawingExits: number } }).__fakeBridge.drawingExits)).toBe(1);
});

test("a drag past the window edge stops at the edge", async ({ page }) => {
  await page.keyboard.press("r");
  await drag(page, [1100, 600], [1270, 710]);
  expect(await count(page)).toBe(1);
  await page.mouse.move(1200, 650);
  await page.mouse.down();
  await page.mouse.move(1279, 719);
  await page.mouse.up();
  expect(await count(page)).toBe(2);
});

test("keys that are not Drawing mode keys do nothing", async ({ page }) => {
  await page.keyboard.press("x");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Enter");
  await expect(canvas(page)).toHaveAttribute("data-tool", "arrow");
  expect(await page.evaluate(() => (window as unknown as { __fakeBridge: { drawingExits: number } }).__fakeBridge.drawingExits)).toBe(0);
});
