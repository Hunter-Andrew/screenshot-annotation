import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";

// The hex field of the Style panel's ColorField (ticket 34) in real Chromium with the real Fabric
// canvas and the fake platform bridge: typed colors reach the Export's pixels and survive a restart,
// an invalid value changes nothing.

interface Shape {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: { color: string; width: number };
  fill: { mode: string; color: string; opacity: number };
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
  toolStyles: Record<string, unknown>;
}
type InPage = { __fakeBridge: Bridge };

async function capture(page: Page, width: number, height: number) {
  await page.evaluate(
    ({ width, height, stamp }) => {
      const rgba = new Uint8Array(width * height * 4).fill(200);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date(stamp) });
    },
    { width, height, stamp: Date.now() },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
}

async function savedShapes(page: Page): Promise<Shape[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}

async function expectSaved(page: Page, check: (shapes: Shape[]) => boolean, message: string) {
  await expect
    .poll(async () => check(await savedShapes(page)), { message, timeout: 6000, intervals: [200] })
    .toBe(true);
}

async function drawRect(page: Page, width: number) {
  const box = (await page.locator(".stage").boundingBox())!;
  const scale = box.width / width;
  const at = (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale });
  await page.keyboard.press("r");
  const [from, to] = [at(50, 50), at(250, 150)];
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expectSaved(page, ([r]) => r?.type === "rect", "the rectangle is saved");
}

async function typeHex(page: Page, name: string, text: string) {
  const field = page.getByRole("textbox", { name, exact: true });
  await field.fill(text);
  await field.press("Enter");
  return field;
}

test.describe("hex color field", () => {
  test.use({ viewport: { width: 760, height: 520 } });

  test("typed stroke and fill hex colors reach the Export's pixels and are remembered after a reload", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    await drawRect(page, 400);

    await page.getByRole("button", { name: "Solid" }).click();
    await typeHex(page, "Color hex", "#2563EB"); // upper case, with #
    await typeHex(page, "Fill color hex", "f80"); // short form, no #
    await expect(page.getByRole("textbox", { name: "Fill color hex" })).toHaveValue("#ff8800");
    await expectSaved(
      page,
      ([r]) => r?.stroke.color === "#2563eb" && r.fill.color === "#ff8800" && r.fill.mode === "solid",
      "typed colors saved in the stored #rrggbb format",
    );
    const [r] = await savedShapes(page);
    const [x, y, w, h] = [Math.round(r!.x), Math.round(r!.y), Math.round(r!.width), Math.round(r!.height)];

    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
    const png = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[0]!)));
    const out = decodePixels(png);
    const px = (px: number, py: number) => {
      const i = (Math.floor(py) * out.width + Math.floor(px)) * 4;
      return Array.from(out.rgba.slice(i, i + 4));
    };
    expect(px(x + w / 2, y)).toEqual([37, 99, 235, 255]); // the outline: #2563eb
    expect(px(x + w / 2, y + h / 2)).toEqual([255, 136, 0, 255]); // the inside: #ff8800
    expect(px(5, 5)).toEqual([200, 200, 200, 255]);

    // The "app restarts": the fake platform keeps its settings like settings.json.
    await expect
      .poll(() => page.evaluate(() => JSON.stringify((window as unknown as InPage).__fakeBridge.toolStyles)), { timeout: 4000 })
      .toContain("#ff8800");
    await page.reload();
    await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
    await expect(page.locator(".canvas-container")).toHaveCount(1);

    await page.keyboard.press("r");
    await expect(page.getByRole("textbox", { name: "Color hex", exact: true })).toHaveValue("#2563eb");
    await expect(page.getByRole("textbox", { name: "Fill color hex" })).toHaveValue("#ff8800");
    // The reopened rectangle itself kept its colors too.
    await expectSaved(page, ([s]) => s?.stroke.color === "#2563eb" && s.fill.color === "#ff8800", "still saved");
  });

  test("invalid input shows an error and leaves the color alone; the field follows the palette", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    await drawRect(page, 400);
    const field = page.getByRole("textbox", { name: "Color hex", exact: true });
    await expect(field).toHaveValue("#e02424");

    await typeHex(page, "Color hex", "#12345g");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toBeVisible();
    await page.waitForTimeout(1300); // longer than the auto-save pause
    expect((await savedShapes(page))[0]!.stroke.color).toBe("#e02424");

    await field.blur();
    await expect(field).toHaveValue("#e02424");
    await expect(page.getByRole("alert")).toHaveCount(0);

    await page.getByRole("button", { name: "Color #16a34a" }).click();
    await expect(field).toHaveValue("#16a34a");
    await expectSaved(page, ([r]) => r?.stroke.color === "#16a34a", "palette still works");
  });

  test("typing letters that are tool shortcuts into the hex field keeps the tool and the picture", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    await drawRect(page, 400);

    const field = page.getByRole("textbox", { name: "Color hex", exact: true });
    await field.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("aelrtpv");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Backspace");
    await expect(field).toBeFocused();
    expect(await savedShapes(page)).toHaveLength(1);
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
  });
});
