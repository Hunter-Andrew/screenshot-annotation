import { expect, test } from "@playwright/test";

test("Settings lists Space, M and a tool key under the right groups, without sideways scroll", async ({ page }) => {
  await page.goto("/#settings");
  const shortcuts = page.getByRole("region", { name: "Shortcuts" });
  await expect(shortcuts).toBeVisible();

  const overlay = shortcuts.getByRole("group", { name: "Capture overlay" });
  await expect(overlay.getByRole("listitem", { name: "Capture the whole monitor under the cursor" })).toContainText("Space");
  await expect(overlay.getByRole("listitem", { name: "Toggle the magnifier" })).toContainText("M");

  const editor = shortcuts.getByRole("group", { name: "Editor" });
  await expect(editor.getByRole("listitem", { name: "Arrow" })).toContainText("A");
  await expect(editor.getByRole("listitem", { name: "Undo" })).toContainText("Fixed");

  await expect(shortcuts.getByRole("group", { name: "Capture" }).getByRole("button", { name: "Ctrl+Shift+S" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
