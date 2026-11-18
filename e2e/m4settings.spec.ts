import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";
import { at } from "./blurPattern";

// M4 settings on the real canvas with the fake bridge: the Style panel never scrolls sideways for Text and Callout,
// the Library Strip collapses and keeps it across a reload, the Canvas margin during crop, and the Dark image
// background colour (applied when drawn, so a change reaches an image already made).

interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  setCropMargin(value: number): Promise<void>;
  setDarkBackground(value: string): Promise<void>;
  setImageBackground(value: string): Promise<void>;
  copiedImages: Uint8Array[];
}
type InPage = { __fakeBridge: Bridge };

async function capture(page: Page, width: number, height: number) {
  await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
  await page.evaluate(
    ({ width, height }) => {
      const rgba = new Uint8Array(width * height * 4).fill(200);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date() });
    },
    { width, height },
  );
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
}

const setting = (page: Page, method: "setCropMargin" | "setDarkBackground" | "setImageBackground", value: unknown) =>
  page.evaluate(([m, v]) => (window as unknown as { __fakeBridge: Record<string, (x: unknown) => Promise<void>> }).__fakeBridge[m as string]!(v), [method, value] as const);

async function copied(page: Page) {
  const before = await page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(before + 1);
  const bytes = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages.at(-1)!)));
  return decodePixels(bytes);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

/** True when the Style panel (and the elements in it) fit its width: nothing scrolls sideways or sticks out. */
const panelFits = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".style-panel")!;
    const right = panel.getBoundingClientRect().right;
    const wide = [...panel.querySelectorAll<HTMLElement>("*")].filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > right + 0.5);
    return { scrolls: panel.scrollWidth > panel.clientWidth, outside: wide.map((el) => el.getAttribute("aria-label") ?? el.tagName) };
  });

test.describe("the Style panel at the narrowest window", () => {
  test.use({ viewport: { width: 760, height: 480 } });

  for (const [key, label, name] of [["t", "Text", "Text"], ["o", "Callout", "Callout"]] as const) {
    test(`${label}: the font controls wrap and nothing needs a horizontal scroll, the last Align button included`, async ({ page }) => {
      await page.goto("/");
      await capture(page, 400, 300);
      await page.getByRole("button", { name: "100%" }).click();
      const box = (await page.locator(".stage").boundingBox())!;
      await page.keyboard.press(key);
      await page.mouse.click(box.x + 60, box.y + 80);
      await expect(page.locator("textarea")).toBeFocused();
      await page.keyboard.type("Hello");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("region", { name: "Font" })).toBeVisible();
      expect(name).toBeTruthy();

      expect(await panelFits(page)).toEqual({ scrolls: false, outside: [] });
      // Every alignment button lies inside the panel's width, so none needs a sideways scroll to be reached.
      const inside = await page.evaluate(() => {
        const panel = document.querySelector(".style-panel")!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('[role="group"][aria-label="Alignment"] button, [role="group"][aria-label="Vertical alignment"] button')].map((b) => {
          const r = b.getBoundingClientRect();
          return r.left >= panel.left && r.right <= panel.right;
        });
      });
      expect(inside).toEqual([true, true, true, true, true, true]);
      // And the buttons are on more than one row (they wrapped rather than shrank).
      const tops = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[role="group"][aria-label="Alignment"] button, [role="group"][aria-label="Vertical alignment"] button')].map((b) => Math.round(b.getBoundingClientRect().top)),
      );
      expect(new Set(tops).size).toBeGreaterThan(1);
      // The horizontal three share the first row and the vertical three share the second: a wrap never splits a group.
      expect(tops[0]).toBe(tops[1]);
      expect(tops[1]).toBe(tops[2]);
      expect(tops[3]).toBe(tops[4]);
      expect(tops[4]).toBe(tops[5]);
      expect(tops[3]).toBeGreaterThan(tops[0]);
    });
  }
});

test.describe("the Library Strip collapse", () => {
  test("the chevron collapses the strip to a thin bar, expands it again, and the choice survives a reload", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 200);
    const strip = page.getByRole("region", { name: "Library Strip" });
    const height = async () => (await strip.boundingBox())!.height;
    const full = await height();
    expect(full).toBeGreaterThan(60);

    await page.getByRole("button", { name: "Collapse Library Strip" }).click();
    await expect(strip).toHaveAttribute("data-collapsed", "true");
    expect(await height()).toBeLessThan(30);
    await expect(page.getByRole("button", { name: /All captures/ })).toBeHidden();

    await page.reload();
    await expect(page.getByRole("button", { name: "Expand Library Strip" })).toBeVisible();
    await expect(strip).toHaveAttribute("data-collapsed", "true");
    expect(await height()).toBeLessThan(30);

    await page.getByRole("button", { name: "Expand Library Strip" }).click();
    await expect(strip).toHaveAttribute("data-collapsed", "false");
    expect(Math.abs((await height()) - full)).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: /All captures/ })).toBeVisible();
  });
});

test.describe("Canvas margin during crop", () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test("the view keeps the Crop margin around the canvas while the Crop tool is on, and goes back to the Canvas margin after", async ({ page }) => {
    await page.goto("/");
    await capture(page, 1600, 900);
    const minGap = () =>
      page.evaluate(() => {
        const r = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const area = r(".area");
        const well = r(".well");
        return Math.min(area.left - well.left, well.right - area.right, area.top - well.top, well.bottom - area.bottom);
      });
    await expect.poll(minGap).toBeLessThan(18); // the default Canvas margin, 16
    await setting(page, "setCropMargin", 120);
    await page.keyboard.press("c");
    await expect.poll(minGap).toBeGreaterThan(118); // the view re-fitted to the Crop margin
    await expect.poll(minGap).toBeLessThan(122);
    await page.keyboard.press("v");
    await expect.poll(minGap).toBeLessThan(18);
  });
});

test.describe("Dark image background", () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test("an image whose background is Dark is drawn in the setting's colour, also after the setting changes", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
    await setting(page, "setImageBackground", "dark");
    await capture(page, 300, 200);
    const stage = (await page.locator(".stage").boundingBox())!;
    await page.keyboard.press("r");
    await drag(page, { x: stage.x + 200, y: stage.y + 50 }, { x: stage.x + 340, y: stage.y + 120 });

    let px = await copied(page);
    expect(px.width).toBeGreaterThan(320);
    expect(Array.from(at(px, px.width - 3, px.height - 3))).toEqual([0x19, 0x19, 0x19, 255]); // the default, #191919

    // Reopened or not, it is drawn with the colour as it is now.
    await setting(page, "setDarkBackground", "#336699");
    px = await copied(page);
    expect(Array.from(at(px, px.width - 3, px.height - 3))).toEqual([0x33, 0x66, 0x99, 255]);
    // The editor shows it too.
    expect(await page.locator(".area").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(51, 102, 153)");
  });
});

test.describe("Settings", () => {
  test("the Image section has the dark background colour and the crop margin", async ({ page }) => {
    await page.goto("/#settings");
    const dark = page.getByLabel("Dark image background");
    await expect(dark).toHaveValue("#191919");
    await expect(page.getByLabel("Canvas margin during crop (px)")).toHaveValue("150");
    await expect(page.getByLabel("Canvas margin (px)")).toHaveValue("16");
  });
});
