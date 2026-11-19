import { expect, test, type Page } from "@playwright/test";

type Fake = { laserPointerHotkey: string; drawingModeHotkey: string; takenHotkeys: Set<string> };
const fake = <T,>(page: Page, read: (f: Fake) => T) =>
  page.evaluate(`(${read.toString()})(window.__fakeBridge)`) as Promise<T>;

const pointer = (page: Page, combo: string) =>
  page.getByRole("button", { name: `Laser pointer hotkey: ${combo}`, exact: true });
const drawing = (page: Page, combo: string) =>
  page.getByRole("button", { name: `Drawing mode hotkey: ${combo}`, exact: true });

test("each demo hotkey can be set and survives reopening Settings", async ({ page }) => {
  await page.goto("/#settings");
  await expect(page.getByRole("heading", { name: "Demo tools" })).toBeVisible();
  await pointer(page, "Ctrl+Shift+L").click();
  await page.keyboard.press("Control+Alt+p");
  await expect(pointer(page, "Ctrl+Alt+P")).toBeVisible();
  await drawing(page, "Ctrl+Shift+D").click();
  await page.keyboard.press("Control+Alt+o");
  await expect(drawing(page, "Ctrl+Alt+O")).toBeVisible();
  expect(await fake(page, (f) => [f.laserPointerHotkey, f.drawingModeHotkey])).toEqual(["ctrl+alt+p", "ctrl+alt+o"]);
  await page.reload();
  await expect(pointer(page, "Ctrl+Alt+P")).toBeVisible();
  await expect(drawing(page, "Ctrl+Alt+O")).toBeVisible();
});

test("the capture hotkey, the other demo hotkey and Print Screen are refused with a message", async ({ page }) => {
  await page.goto("/#settings");
  await pointer(page, "Ctrl+Shift+L").click();
  await page.keyboard.press("Control+Shift+s");
  await expect(page.getByRole("alert")).toContainText("capture hotkey");
  await pointer(page, "Ctrl+Shift+L").click();
  await page.keyboard.press("Control+Shift+d");
  await expect(page.getByRole("alert")).toContainText("Drawing mode hotkey");
  await pointer(page, "Ctrl+Shift+L").click();
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "PrintScreen" })));
  await expect(page.getByRole("alert")).toContainText("Print Screen");
  expect(await fake(page, (f) => f.laserPointerHotkey)).toBe("ctrl+shift+l");
});

test("the capture hotkey cannot take a demo combination", async ({ page }) => {
  await page.goto("/#settings");
  await page.getByRole("button", { name: "Ctrl+Shift+S", exact: true }).click();
  await page.keyboard.press("Control+Shift+l");
  await expect(page.getByRole("alert").first()).toContainText("demo-tool hotkey");
});

test("a combination another app owns shows the conflict message and keeps the old hotkey", async ({ page }) => {
  await page.goto("/#settings");
  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.takenHotkeys.add("ctrl+alt+j"));
  await drawing(page, "Ctrl+Shift+D").click();
  await page.keyboard.press("Control+Alt+j");
  await expect(page.getByRole("alert")).toContainText("Ctrl+Alt+J is already in use by another app");
  expect(await fake(page, (f) => f.drawingModeHotkey)).toBe("ctrl+shift+d");
});
