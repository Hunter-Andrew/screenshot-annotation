import { expect, test } from "@playwright/test";

test("Settings lists Space, M and a tool key under the right groups, without sideways scroll", async ({ page }) => {
  await page.goto("/#settings/shortcuts");
  const shortcuts = page.getByRole("region", { name: "Shortcuts" });
  await expect(shortcuts).toBeVisible();

  const overlay = shortcuts.getByRole("group", { name: "Capture overlay" });
  await expect(overlay.getByRole("listitem", { name: "Capture the whole monitor under the cursor" })).toContainText("Space");
  await expect(overlay.getByRole("listitem", { name: "Toggle the magnifier" })).toContainText("M");

  const editor = shortcuts.getByRole("group", { name: "Editor" });
  await expect(editor.getByRole("listitem", { name: "Arrow" })).toContainText("A");
  await expect(editor.getByRole("listitem", { name: "Undo" })).toContainText("Fixed");

  const drawing = shortcuts.getByRole("group", { name: "Drawing mode" });
  await expect(drawing.getByRole("listitem")).toHaveCount(7);
  await expect(drawing.getByRole("listitem", { name: "Highlighter" })).toContainText("H");
  await expect(drawing.getByRole("listitem", { name: "Redo" })).toContainText("Ctrl+Y");
  await expect(drawing.getByRole("button")).toHaveCount(0);

  await expect(shortcuts.getByRole("group", { name: "Capture" }).getByRole("button", { name: "Ctrl+Shift+S" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
