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

  test("H draws a see-through yellow stroke; Shift makes it straight and horizontal; Copy burns it in", async ({ page }) => {
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
    expect(h!.stroke).toEqual({ color: "#facc15", width: 20 });
    expect(h!.opacity.value).toBeLessThan(1);

    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
    const png = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[0]!)));
    const px = decodePixels(png);
    const pixel = (x: number, y: number) => Array.from(px.rgba.slice((y * px.width + x) * 4, (y * px.width + x) * 4 + 4));
    const [r, g, b] = pixel(250, 150);
    // Yellow over white at half strength: still bright, but visibly less blue; the page behind shows through.
    expect(r).toBeGreaterThan(240);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeLessThan(200);
    expect(b).toBeGreaterThan(80);
    expect(pixel(250, 250)).toEqual([255, 255, 255, 255]); // untouched below the stroke
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
