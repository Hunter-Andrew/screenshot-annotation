import { expect, type Page, test } from "@playwright/test";

// The Library Strip, delete with Undo and the grid, in real Chromium with the fake platform bridge
// (browser storage keeps the Library across a reload, like the real folder survives a restart).

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  libraryFiles: { path: string; bytes: Uint8Array }[];
  trashedPaths: string[];
  copiedImages: Uint8Array[];
  addLibraryFile(png: Uint8Array, options?: { path?: string; capturedAt?: Date }): string;
  removeLibraryFile(path: string): void;
}
type InPage = { __fakeBridge: Bridge };

async function capture(page: Page, at: Date, shade: number) {
  const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.libraryFiles.length);
  await page.evaluate(
    ({ at, shade }) => {
      const rgba = new Uint8Array(4 * 4 * 4).fill(shade);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width: 4, height: 4, rgba, capturedAt: new Date(at) });
    },
    { at: at.getTime(), shade },
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.libraryFiles.length))
    .toBe(before + 1);
  await expect(page.getByText(/Saved to/)).toBeVisible();
}

const T1 = new Date(2026, 10, 15, 13, 45, 1);
const T2 = new Date(2026, 10, 15, 13, 46, 2);
const T3 = new Date(2026, 10, 15, 13, 47, 3);
const strip = (page: Page) => page.getByRole("region", { name: "Library Strip" });
const open = (page: Page, when: string, scope = strip(page)) => scope.getByRole("button", { name: `Open image from ${when}` });

test("the strip lists captures newest first, and a click switches images", async ({ page }) => {
  await page.goto("/");
  await capture(page, T1, 40);
  await capture(page, T2, 120);
  await capture(page, T3, 200);

  const labels = await strip(page).getByRole("button", { name: /^Open image/ }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels).toEqual([
    "Open image from 15 Nov 2026 13:47:03",
    "Open image from 15 Nov 2026 13:46:02",
    "Open image from 15 Nov 2026 13:45:01",
  ]);
  // Real thumbnails: each button holds a loaded picture.
  await expect(strip(page).locator(".lib-thumb img")).toHaveCount(3);

  await open(page, "15 Nov 2026 13:45:01").click();
  await expect(open(page, "15 Nov 2026 13:45:01")).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  const first = await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!.subarray(0, 8)));
  expect(first).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test("after a reload the strip is still there and the newest image is on show", async ({ page }) => {
  await page.goto("/");
  await capture(page, T1, 40);
  await capture(page, T2, 120);
  await page.reload();
  await expect(strip(page).getByRole("button", { name: "All captures (2)" })).toBeVisible();
  await expect(open(page, "15 Nov 2026 13:46:02")).toHaveAttribute("aria-current", "true");
});

test("deleting from the strip goes to the Recycle Bin, and Undo puts the image back", async ({ page }) => {
  await page.goto("/");
  await capture(page, T1, 40);
  await capture(page, T2, 120);

  await open(page, "15 Nov 2026 13:45:01").hover();
  await strip(page).getByRole("button", { name: "Delete image from 15 Nov 2026 13:45:01" }).click();

  await expect(page.getByRole("group", { name: "Deleted" })).toContainText("1 image moved to the Recycle Bin");
  await expect(strip(page).getByRole("button", { name: "All captures (1)" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as InPage).__fakeBridge.trashedPaths.length)).toBe(1);

  await page.getByRole("button", { name: "Undo delete" }).click();
  await expect(strip(page).getByRole("button", { name: "All captures (2)" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Deleted" })).toHaveCount(0);
});

test("Ctrl+click picks thumbnails, Delete moves them, in the grid too", async ({ page }) => {
  await page.goto("/");
  await capture(page, T1, 40);
  await capture(page, T2, 120);
  await capture(page, T3, 200);
  await page.getByRole("button", { name: "All captures (3)" }).click();

  const grid = page.getByRole("region", { name: "All captures" });
  await expect(grid.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(grid.getByText("3 captures")).toBeVisible();
  await expect(grid.locator(".lib-thumb img")).toHaveCount(3);
  await open(page, "15 Nov 2026 13:45:01", grid).click({ modifiers: ["Control"] });
  await open(page, "15 Nov 2026 13:46:02", grid).click({ modifiers: ["Control"] });
  await expect(grid.getByText("2 selected")).toBeVisible();

  await grid.getByRole("button", { name: "Delete 2" }).click();
  await expect(grid.getByText("1 capture")).toBeVisible();
  await page.getByRole("button", { name: "Undo delete" }).click();
  await expect(grid.getByText("3 captures")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(grid).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
});

test("the folder is the source of truth: a file dropped in appears, one deleted in Explorer goes", async ({ page }) => {
  await page.goto("/");
  await capture(page, T1, 40);

  const dropped = await page.evaluate(async () => {
    const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
    const png = encodeRgbaPng(2, 2, new Uint8Array(16).fill(255));
    return (window as unknown as InPage).__fakeBridge.addLibraryFile(png, { path: "2026-11\\from-explorer.png" });
  });
  await expect(strip(page).getByRole("button", { name: "All captures (2)" })).toBeVisible();

  await page.evaluate((path) => (window as unknown as InPage).__fakeBridge.removeLibraryFile(path), dropped);
  await expect(strip(page).getByRole("button", { name: "All captures (1)" })).toBeVisible();
});
