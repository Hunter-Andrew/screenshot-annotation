import { expect, type Page, test } from "@playwright/test";

// The editor's pointer toggle (ticket 51) in real Chromium with the real Fabric canvas and the fake bridge.

type InPage = {
  __fakeBridge: {
    simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
    pressLaserPointerHotkey(): void;
    laserPointerOn: boolean;
  };
};

async function capture(page: Page) {
  await page.waitForFunction(() => Boolean((window as unknown as Partial<InPage>).__fakeBridge));
  await page.evaluate(() => {
    const rgba = new Uint8Array(400 * 300 * 4).fill(200);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    (window as unknown as InPage).__fakeBridge.simulateCapture({ width: 400, height: 300, rgba, capturedAt: new Date() });
  });
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
}

const hotkey = (page: Page) => page.evaluate(() => (window as unknown as InPage).__fakeBridge.pressLaserPointerHotkey());
const isOn = (page: Page) => page.evaluate(() => (window as unknown as InPage).__fakeBridge.laserPointerOn);
const nav = (page: Page) => page.getByRole("navigation", { name: "Tools" });
const toggle = (page: Page) => nav(page).getByRole("button", { name: "Laser pointer" });
const selectedTools = (page: Page) => nav(page).locator('.tool[aria-pressed="true"]');

test("the button toggles the pointer, leaves no tool selected and ignores the canvas", async ({ page }) => {
  await page.goto("/");
  await capture(page);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(toggle(page)).toHaveAttribute("title", "Laser pointer (Ctrl+Shift+L)");

  await nav(page).getByRole("button", { name: "Rectangle (R)" }).click();
  await toggle(page).click();
  expect(await isOn(page)).toBe(true);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(selectedTools(page)).toHaveCount(0);

  // A drag on the canvas draws and selects nothing, and the Style panel shows no tool.
  const box = (await page.locator(".canvas-container").boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 140, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await toggle(page).click();
  expect(await isOn(page)).toBe(false);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(selectedTools(page)).toHaveCount(1);
  await expect(nav(page).getByRole("button", { name: "Select (V)" })).toHaveAttribute("aria-pressed", "true");
});

test("the hotkey or tray state is followed, and switching off selects Select", async ({ page }) => {
  await page.goto("/");
  await capture(page);
  await page.keyboard.press("p");

  await hotkey(page);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(selectedTools(page)).toHaveCount(0);
  await hotkey(page);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(nav(page).getByRole("button", { name: "Select (V)" })).toHaveAttribute("aria-pressed", "true");
});

test("picking a tool by click or key turns the pointer off and selects it", async ({ page }) => {
  await page.goto("/");
  await capture(page);

  await toggle(page).click();
  await nav(page).getByRole("button", { name: "Ellipse (E)" }).click();
  expect(await isOn(page)).toBe(false);
  await expect(nav(page).getByRole("button", { name: "Ellipse (E)" })).toHaveAttribute("aria-pressed", "true");

  await toggle(page).click();
  await page.keyboard.press("l");
  expect(await isOn(page)).toBe(false);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(nav(page).getByRole("button", { name: "Line (L)" })).toHaveAttribute("aria-pressed", "true");
  await expect(selectedTools(page)).toHaveCount(1);
});
