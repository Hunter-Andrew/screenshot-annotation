import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";

// The Highlighter in real Chromium with the real Fabric canvas and the fake bridge.

interface Highlight {
  id: string;
  type: "highlight";
  points: { x: number; y: number }[];
  stroke: { color: string; width: number };
  opacity: { value: number };
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
type InPage = { __fakeBridge: Bridge };

async function capture(page: Page, width: number, height: number) {
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge)); // the app installs the fake bridge a moment after load
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4).fill(255); // white
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width, height },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
}

async function saved(page: Page): Promise<Highlight[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}

test.describe("the Highlighter", () => {
  test.use({ viewport: { width: 760, height: 520 } });

  test("H draws a yellow multiply stroke; Shift makes it straight and horizontal; Copy burns it in", async ({ page }) => {
    await page.goto("/");
    await capture(page, 600, 400);
    const box = (await page.locator(".stage").boundingBox())!;
    const scale = box.width / 600;
    const at = (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale });

    await page.keyboard.press("h");
    await expect(page.getByRole("button", { name: /^Highlighter/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Opacity" })).toBeVisible();

    // A wobbly drag with Shift held: the stroke must come out flat at the press height.
    const start = at(100, 150);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    for (const [x, y] of [[200, 170], [300, 130], [400, 190]] as const) await page.mouse.move(at(x, y).x, at(x, y).y, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up("Shift");

    await expect.poll(async () => (await saved(page)).length, { timeout: 6000 }).toBe(1);
    const [h] = await saved(page);
    expect(h!.type).toBe("highlight");
    expect(h!.points.every((p) => Math.abs(p.y - 150) <= 2)).toBe(true);
    expect(Math.abs(h!.points.at(-1)!.x - 400)).toBeLessThanOrEqual(3);
    expect(h!.stroke).toEqual({ color: "#ffff00", width: 18 });
    expect(h!.opacity.value).toBe(0.6);

    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
    const png = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[0]!)));
    const px = decodePixels(png);
    const pixel = (x: number, y: number) => Array.from(px.rgba.slice((y * px.width + x) * 4, (y * px.width + x) * 4 + 4));
    const [r, g, b] = pixel(250, 150);
    // #ffff00 multiplied over white is #ffff00; at the default 60% two fifths of the white shows through.
    expect([r, g, b]).toEqual([255, 255, 102]);
    expect(pixel(250, 250)).toEqual([255, 255, 255, 255]); // untouched below the stroke
  });

  test("the cursor is a ring as wide as the stroke in the highlighter's colour, scaled by the zoom, and goes with the tool", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    await page.keyboard.press("Control+1"); // 100%
    const box = (await page.locator(".stage").boundingBox())!;
    const ringPixels = async (cx: number, cy: number, radius: number) =>
      page.evaluate(
        ({ x, y }) => {
          const canvas = document.querySelector<HTMLCanvasElement>("canvas.lower-canvas")!;
          const area = document.querySelector(".area")!.getBoundingClientRect();
          const c = canvas.getBoundingClientRect();
          const data = canvas.getContext("2d")!.getImageData(Math.round(area.left - c.left) + x - 3, Math.round(area.top - c.top) + y - 3, 7, 7).data;
          let marked = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i + 2]! < 200) marked++; // white Capture; the ring is yellow (blue channel 0)
          return marked;
        },
        { x: cx + radius, y: cy },
      );
    const settle = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

    await page.keyboard.press("h");
    await page.mouse.move(box.x + 150, box.y + 100);
    await expect(page.locator("canvas.upper-canvas")).toHaveCSS("cursor", "none"); // no crosshair: the ring is the cursor
    await page.mouse.move(box.x + 151, box.y + 100);
    await page.mouse.move(box.x + 150, box.y + 100);
    await settle();
    expect(await ringPixels(150, 100, 10)).toBeGreaterThan(0); // the default stroke is 20 px wide: radius 10
    expect(await ringPixels(150, 100, 25)).toBe(0);

    // Zoomed in, the ring is that much further from the pointer on the screen.
    await page.keyboard.press("Control+=");
    await settle();
    const zoomed = (await page.locator(".stage").boundingBox())!;
    const scale = zoomed.width / 300;
    expect(scale).toBeGreaterThan(1.4);
    await page.mouse.move(zoomed.x + 100, zoomed.y + 100);
    await page.mouse.move(zoomed.x + 101, zoomed.y + 100);
    await page.mouse.move(zoomed.x + 100, zoomed.y + 100);
    await settle();
    expect(await ringPixels(100, 100, Math.round(10 * scale))).toBeGreaterThan(0);
    expect(await ringPixels(100, 100, Math.round(5 * scale))).toBe(0);

    // Another tool: the ring goes.
    await page.keyboard.press("p");
    await page.mouse.move(zoomed.x + 100, zoomed.y + 101);
    await settle();
    expect(await ringPixels(100, 100, Math.round(10 * scale))).toBe(0);
  });

  test("the opacity is one of four presets, 60% to start with, and the stroke is saved with the chosen one", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const box = (await page.locator(".stage").boundingBox())!;
    await page.keyboard.press("h");
    const opacity = page.getByRole("region", { name: "Opacity" });
    await expect(opacity.getByRole("button")).toHaveText(["25%", "40%", "60%", "80%", "100%"]);
    await expect(opacity.getByRole("button", { name: "60%" })).toHaveAttribute("aria-pressed", "true");
    await expect(opacity.getByRole("slider")).toHaveCount(0);
    await opacity.getByRole("button", { name: "40%" }).click();
    await expect(opacity.getByRole("button", { name: "40%" })).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(box.x + 50, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 100, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await saved(page))[0]?.opacity.value, { timeout: 6000 }).toBe(0.4);
  });

  test("a click without dragging draws nothing", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    const box = (await page.locator(".stage").boundingBox())!;
    await page.keyboard.press("h");
    await page.mouse.click(box.x + 100, box.y + 100);
    await page.waitForTimeout(600);
    expect(await saved(page)).toHaveLength(0);
  });
});
