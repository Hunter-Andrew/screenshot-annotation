import { expect, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";

// 2x2: red, green / blue, white. Supplied by the test so expectations are independent of the fake.
const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

interface FakeBridge {
  simulateCapture(shot: { width: number; height: number; rgba: number[] }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
}
declare global {
  interface Window {
    __fakeBridge: FakeBridge;
  }
}

test("a capture appears in the editor, is saved to the Library, and Copy writes a plain PNG", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Press Ctrl+Shift+S to capture")).toBeVisible();

  // The hotkey (Rust side) delivers a Capture; the fake bridge stands in for it.
  await page.evaluate((rgba) => {
    window.__fakeBridge.simulateCapture({ width: 2, height: 2, rgba });
  }, PIXELS);

  const shown = page.getByRole("img", { name: "Capture" });
  await expect(shown).toBeVisible();
  expect(await shown.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([2, 2]);

  // Saved immediately: a Library PNG named by capture time, with the editable data embedded.
  const saved = await page.evaluate(() =>
    window.__fakeBridge.libraryFiles.map((f) => ({ path: f.path, bytes: Array.from(f.bytes) })),
  );
  expect(saved).toHaveLength(1);
  expect(saved[0]!.path).toMatch(/^2\d{3}-\d{2}\\2\d{3}-\d{2}-\d{2} \d{6}\.png$/);
  const library = Uint8Array.from(saved[0]!.bytes);
  expect(hasChunk(library, "snAP")).toBe(true);
  expect(decodePixels(library).rgba).toEqual(PIXELS);
  await expect(page.getByText(/Saved to/)).toBeVisible();

  await page.getByRole("button", { name: "Copy" }).click();

  const copied = await page.evaluate(() => window.__fakeBridge.copiedImages.map((b) => Array.from(b)));
  expect(copied).toHaveLength(1);
  const clipboard = Uint8Array.from(copied[0]!);
  expect(Array.from(clipboard.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(hasChunk(clipboard, "snAP")).toBe(false);
  expect(decodePixels(clipboard)).toEqual({ width: 2, height: 2, rgba: PIXELS });
  await expect(page.getByText("Copied")).toBeVisible();
});

test("the Capture button asks the platform to capture", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
});

test("Save as PNG… writes a plain PNG and Discard removes the Library file", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((rgba) => {
    window.__fakeBridge.simulateCapture({ width: 2, height: 2, rgba });
  }, PIXELS);
  await expect(page.getByText(/Saved to/)).toBeVisible();

  await page.getByRole("button", { name: "Save as PNG…" }).click();
  await expect(page.getByText(/Saved a copy to/)).toBeVisible();
  const exported = await page.evaluate(() =>
    (window.__fakeBridge as unknown as { savedAs: { bytes: Uint8Array }[] }).savedAs.map((f) =>
      Array.from(f.bytes),
    ),
  );
  expect(exported).toHaveLength(1);
  const plain = Uint8Array.from(exported[0]!);
  expect(hasChunk(plain, "snAP")).toBe(false);
  expect(decodePixels(plain)).toEqual({ width: 2, height: 2, rgba: PIXELS });

  await page.keyboard.press("Control+Delete");
  await expect(page.getByText("Press Ctrl+Shift+S to capture")).toBeVisible();
  expect(await page.evaluate(() => window.__fakeBridge.libraryFiles.length)).toBe(0);
});

test("a new capture is already on the clipboard as a plain PNG, and the editor says so", async ({ page }) => {
  await page.goto("/");
  // The platform copies the Capture when it delivers it; the fake bridge stands in for that.
  await page.evaluate((rgba) => {
    (window.__fakeBridge as unknown as { simulateCapture(s: object): void }).simulateCapture({
      width: 2,
      height: 2,
      rgba,
      clipboard: "copied",
    });
  }, PIXELS);

  await expect(page.getByRole("status")).toContainText("Copied to clipboard");
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  const copied = await page.evaluate(() => window.__fakeBridge.copiedImages.map((b) => Array.from(b)));
  expect(copied).toHaveLength(1);
  const clipboard = Uint8Array.from(copied[0]!);
  expect(hasChunk(clipboard, "snAP")).toBe(false);
  expect(decodePixels(clipboard)).toEqual({ width: 2, height: 2, rgba: PIXELS });
});
