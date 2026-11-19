import { expect, test, type Page } from "@playwright/test";

type Fake = {
  pointerSettings: { color: string; size: string; ripple: boolean };
  pointerHighlightOn: boolean;
  pressPointerHotkey(): void;
  clickPointer(): void;
  setPointerDot(x: number, y: number): void;
};
const fake = <T,>(page: Page, read: (f: Fake) => T) =>
  page.evaluate(`(${read.toString()})(window.__fakeBridge)`) as Promise<T>;

const switchOn = (page: Page) => page.getByRole("checkbox", { name: "Pointer highlight is on" });
const ripple = (page: Page) => page.getByRole("checkbox", { name: "Show a ripple when I left-click" });

test("colour, size and ripple are set in Demo tools and survive reopening Settings", async ({ page }) => {
  await page.goto("/#settings");
  await expect(page.getByRole("heading", { name: "Pointer highlight look" })).toBeVisible();
  // Fresh install: red, Medium, ripple on.
  await expect(page.getByRole("button", { name: "Pointer color #e02424" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio", { name: "Medium" })).toBeChecked();
  await expect(ripple(page)).toBeChecked();

  await page.getByRole("button", { name: "Pointer color #2563eb" }).click();
  await page.getByRole("radio", { name: "Large" }).check();
  await ripple(page).uncheck();
  expect(await fake(page, (f) => f.pointerSettings)).toEqual({ color: "#2563eb", size: "large", ripple: false });

  await page.reload();
  await expect(page.getByRole("button", { name: "Pointer color #2563eb" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio", { name: "Large" })).toBeChecked();
  await expect(ripple(page)).not.toBeChecked();
});

test("a custom colour can be typed as hex and picked with the colour picker", async ({ page }) => {
  await page.goto("/#settings");
  const hex = page.getByRole("textbox", { name: "Pointer color hex" });
  await hex.fill("#12ab34");
  await hex.press("Enter");
  expect((await fake(page, (f) => f.pointerSettings)).color).toBe("#12ab34");
  await page.getByLabel("Custom pointer color").fill("#ff8800");
  expect((await fake(page, (f) => f.pointerSettings)).color).toBe("#ff8800");
  await hex.fill("12");
  await hex.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Use #RGB or #RRGGBB");
  expect((await fake(page, (f) => f.pointerSettings)).color).toBe("#ff8800");
});

test("the on/off state follows the hotkey and the tray item, and is not saved", async ({ page }) => {
  await page.goto("/#settings");
  await expect(switchOn(page)).not.toBeChecked();
  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.pressPointerHotkey());
  await expect(switchOn(page)).toBeChecked();
  expect(await fake(page, (f) => f.pointerHighlightOn)).toBe(true);
  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.pressPointerHotkey());
  await expect(switchOn(page)).not.toBeChecked();
  await switchOn(page).check();
  expect(await fake(page, (f) => f.pointerHighlightOn)).toBe(true);
  await page.reload();
  await expect(switchOn(page)).not.toBeChecked();
});

test("the dot window draws the stored look at once and shows the ripple for a click only when it is on", async ({ page }) => {
  await page.goto("/#pointer-highlight");
  const dot = page.getByRole("img", { name: "Pointer highlight" });
  await expect(dot).toBeVisible();
  await expect(dot).toHaveCSS("width", "14px");
  await expect(dot).toHaveCSS("background-color", "rgb(224, 36, 36)");

  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.pressPointerHotkey());
  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.clickPointer());
  await expect(page.locator("[data-ripple]")).toHaveCount(1);
  await expect(page.locator("[data-ripple]")).toHaveCount(0, { timeout: 2000 });

  await page.evaluate(() =>
    (window as unknown as { __fakeBridge: { setPointerSettings(s: unknown): Promise<void> } }).__fakeBridge.setPointerSettings({
      color: "#16a34a",
      size: "small",
      ripple: false,
    }),
  );
  await expect(dot).toHaveCSS("width", "10px");
  await expect(dot).toHaveCSS("background-color", "rgb(22, 163, 74)");
  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.clickPointer());
  await expect(page.locator("[data-ripple]")).toHaveCount(0);
});

test("hiding the system mouse arrow is on by default, can be turned off, and survives reopening Settings", async ({ page }) => {
  await page.goto("/#settings");
  const hide = page.getByRole("checkbox", { name: "Hide the Windows mouse arrow while the dot is on" });
  await expect(hide).toBeChecked();
  await hide.uncheck();
  expect(await page.evaluate(`window.__fakeBridge.pointerHideCursor`)).toBe(false);
  await page.reload();
  await expect(hide).not.toBeChecked();
  await hide.check();
  expect(await page.evaluate(`window.__fakeBridge.pointerHideCursor`)).toBe(true);
});

test("Drawing mode's Highlighter opacity is a percent from 5 to 60 (20 by default) set in Demo tools", async ({ page }) => {
  await page.goto("/#settings");
  const box = page.getByRole("spinbutton", { name: "Highlighter opacity in Drawing mode (%)" });
  await expect(box).toHaveValue("20");
  await box.fill("35");
  await box.press("Enter");
  expect(await page.evaluate(`window.__fakeBridge.drawingHighlighterOpacity`)).toBe(35);
  await box.fill("90");
  await box.press("Enter");
  await expect(box).toHaveValue("35");
  await page.reload();
  await expect(box).toHaveValue("35");
});
