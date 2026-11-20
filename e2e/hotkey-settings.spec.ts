import { expect, test, type Page } from "@playwright/test";

type Fake = { hotkey: string; takenHotkeys: Set<string>; keyboardSettingsOpened: number };
const fake = <T,>(page: Page, read: (f: Fake) => T) =>
  page.evaluate(
    `(${read.toString()})(window.__fakeBridge)`,
  ) as Promise<T>;

test("recording a new hotkey saves it; a taken one shows a warning and keeps the old one", async ({ page }) => {
  await page.goto("/#settings/shortcuts");
  const field = page.getByRole("button", { name: "Ctrl+Shift+S", exact: true });
  await expect(field).toBeVisible();

  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.takenHotkeys.add("ctrl+alt+j"));

  await field.click();
  await page.keyboard.press("Control+Alt+j");
  await expect(page.getByRole("alert")).toContainText("Ctrl+Alt+J is already in use by another app");
  expect(await fake(page, (f) => f.hotkey)).toBe("ctrl+shift+s");

  await page.getByRole("button", { name: "Ctrl+Shift+S", exact: true }).click();
  await page.keyboard.press("Control+Alt+k");
  await expect(page.getByRole("button", { name: "Ctrl+Alt+K", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await fake(page, (f) => f.hotkey)).toBe("ctrl+alt+k");

  // The choice survives reopening Settings.
  await page.reload();
  await expect(page.getByRole("button", { name: "Ctrl+Alt+K", exact: true })).toBeVisible();
});

test("the Print Screen notice appears once, and [Open Windows setting] uses the deep link", async ({ page }) => {
  await page.goto("/#settings/shortcuts");
  await expect(page.getByText(/Print Screen opens Snipping Tool/)).toBeVisible();
  await expect(page.getByText(/Bluetooth & devices > Keyboard > Use the Print screen button to open screen capturing/)).toBeVisible();

  await page.getByRole("button", { name: "Open Windows setting" }).click();
  await expect(page.getByText(/Print Screen opens Snipping Tool/)).toHaveCount(0);
  expect(await fake(page, (f) => f.keyboardSettingsOpened)).toBe(1);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Capture hotkey" })).toBeVisible();
  await expect(page.getByText(/Print Screen opens Snipping Tool/)).toHaveCount(0);
});

test("[Keep Ctrl+Shift+S] dismisses the notice without opening Windows Settings", async ({ page }) => {
  await page.goto("/#settings/shortcuts");
  await page.getByRole("button", { name: "Keep Ctrl+Shift+S" }).click();
  await expect(page.getByText(/Print Screen opens Snipping Tool/)).toHaveCount(0);
  expect(await fake(page, (f) => f.keyboardSettingsOpened)).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Capture hotkey" })).toBeVisible();
  await expect(page.getByText(/Print Screen opens Snipping Tool/)).toHaveCount(0);
});

test("no notice when the Windows setting is explicitly off", async ({ page }) => {
  await page.goto("/?printScreenSnipping=off#settings/shortcuts");
  await expect(page.getByRole("heading", { name: "Capture hotkey" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ctrl+Shift+S", exact: true })).toBeVisible();
  await expect(page.getByText(/Print Screen opens Snipping Tool/)).toHaveCount(0);
});

test("recording Print Screen shows a persistent warning that survives answering the notice and clears after the Windows setting is turned off", async ({ page }) => {
  await page.goto("/#settings/shortcuts");
  await page.getByRole("button", { name: "Keep Ctrl+Shift+S" }).click();
  await page.getByRole("button", { name: "Ctrl+Shift+S", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "PrintScreen" })));
  await expect(page.getByRole("button", { name: "Print Screen", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Snipping Tool");

  await page.reload();
  await expect(page.getByRole("status")).toContainText("Snipping Tool");

  await page.evaluate(() =>
    (window as unknown as { __fakeBridge: { setPrintScreenSnipping(e: boolean): void } }).__fakeBridge.setPrintScreenSnipping(false),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status")).toHaveCount(0);
});
