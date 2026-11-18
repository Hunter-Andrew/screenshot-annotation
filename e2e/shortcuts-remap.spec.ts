import { expect, test, type Page } from "@playwright/test";

// Remapping in Settings (ticket 47) with the fake bridge; its storage is localStorage, so a page
// opened afterwards (the overlay, the editor) reads what Settings saved, like a window opened later.

interface Fake {
  __fakeBridge: { overlayOutcomes: unknown[]; readyOverlays: number[] };
}

async function remap(page: Page, rowName: string, key: string) {
  const shortcuts = page.getByRole("region", { name: "Shortcuts" });
  await shortcuts.getByRole("button", { name: `Change shortcut for ${rowName}` }).click();
  await page.keyboard.press(key);
}

test("remapping M and Space is used by the next capture overlay", async ({ page }) => {
  await page.goto("/#settings");
  await remap(page, "Toggle the magnifier", "n");
  await remap(page, "Capture the whole monitor under the cursor", "g");
  const overlay = page.getByRole("group", { name: "Capture overlay" });
  await expect(overlay.getByRole("listitem", { name: "Toggle the magnifier" })).toContainText("N");
  await expect(overlay.getByRole("listitem", { name: "Capture the whole monitor under the cursor" })).toContainText("G");

  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto("/#overlay/1");
  await page.reload(); // a hash change alone keeps the settings page
  await expect(page.getByRole("img", { name: "Frozen screen" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as Fake).__fakeBridge.readyOverlays)).toEqual([1]);
  await page.mouse.move(100, 60);
  await expect(page.getByTestId("magnifier")).toBeVisible();

  await page.keyboard.press("m"); // the old key does nothing
  await expect(page.getByTestId("magnifier")).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByTestId("magnifier")).toHaveCount(0);

  await page.keyboard.press("Space"); // the old key does nothing
  expect(await page.evaluate(() => (window as unknown as Fake).__fakeBridge.overlayOutcomes)).toEqual([]);
  await page.keyboard.press("g");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Fake).__fakeBridge.overlayOutcomes))
    .toEqual([{ kind: "monitor" }]);
});

test("a remapped editor tool key selects the tool, and the old key no longer does", async ({ page }) => {
  await page.goto("/#settings");
  await remap(page, "Arrow", "k");
  await expect(page.getByRole("button", { name: "Change shortcut for Arrow" })).toHaveText("K");

  await page.goto("/");
  const arrow = page.getByRole("button", { name: /^Arrow \(K\)/ });
  await expect(arrow).toBeVisible();
  await page.keyboard.press("a");
  await expect(arrow).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("k");
  await expect(arrow).toHaveAttribute("aria-pressed", "true");
});

test("a clash is refused with a message naming the other action, and nothing is saved", async ({ page }) => {
  await page.goto("/#settings");
  await remap(page, "Arrow", "l");
  await expect(page.getByRole("alert").filter({ hasText: "Line" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change shortcut for Arrow" })).toHaveText("A");
  await page.reload();
  await expect(page.getByRole("button", { name: "Change shortcut for Arrow" })).toHaveText("A");
  await expect(page.getByRole("button", { name: "Change shortcut for Line" })).toHaveText("L");
});

test("remapped keys persist across a reload, and Reset all brings the defaults back", async ({ page }) => {
  await page.goto("/#settings");
  await remap(page, "Toggle the magnifier", "n");
  await page.reload();
  const magnifier = page.getByRole("button", { name: "Change shortcut for Toggle the magnifier" });
  await expect(magnifier).toHaveText("N");
  await page.getByRole("button", { name: "Reset all shortcuts" }).click();
  await expect(magnifier).toHaveText("M");
  await page.reload();
  await expect(magnifier).toHaveText("M");
});
