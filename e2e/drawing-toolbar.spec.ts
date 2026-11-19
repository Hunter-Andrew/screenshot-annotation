import { expect, test, type Page } from "@playwright/test";

// The Drawing mode toolbar (ticket 53) in the browser build, with the fake bridge: the page the toolbar window
// loads at `#drawing-toolbar`. Dragging the window and clicking through to apps are platform things (the release
// checklist); here every button is checked against what it asks of the platform.

type Fake = {
  drawingTool: string;
  drawingClickThroughCalls: boolean[];
  drawingToolbarSize: { width: number; height: number } | null;
  drawingUndos: number[];
  drawingExits: number;
  pretendDrawingEdit(edit: { monitor: number; edit: string }): void;
  pretendDrawingTool(tool: string): void;
};
const fake = <T,>(page: Page, read: (f: Fake) => T) => page.evaluate(`(${read.toString()})(window.__fakeBridge)`) as Promise<T>;
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 356, height: 48 });
  await page.goto("/#drawing-toolbar");
  await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
});

test("shows the buttons in order, icon-only, with the key in each tooltip, and Arrow active", async ({ page }) => {
  const names = await page.getByRole("toolbar").locator("button, [role=separator]").evaluateAll((els) =>
    els.map((e) => (e.getAttribute("role") === "separator" ? "|" : e.getAttribute("aria-label"))),
  );
  expect(names).toEqual(["Arrow", "Rectangle", "Pen", "Highlighter", "|", "Use apps", "Undo", "Collapse", "Exit"]);
  const titles = await page.getByRole("toolbar").getByRole("button").evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute("title")]));
  expect(titles).toEqual([
    ["", "Arrow (A)"], ["", "Rectangle (R)"], ["", "Pen (P)"], ["", "Highlighter (H)"],
    ["", "Use apps"], ["", "Undo (Ctrl+Z)"], ["", "Collapse"], ["", "Exit (Esc)"],
  ]);
  await expect(button(page, "Arrow")).toHaveAttribute("aria-pressed", "true");
  const accent = await button(page, "Arrow").evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(accent).toBe("rgb(37, 232, 183)"); // the facelift green, #25E8B7
});

test("each tool button highlights and tells the platform", async ({ page }) => {
  for (const [name, tool] of [["Rectangle", "rect"], ["Pen", "pen"], ["Highlighter", "highlight"], ["Arrow", "arrow"]] as const) {
    await button(page, name).click();
    await expect(button(page, name)).toHaveAttribute("aria-pressed", "true");
    expect(await fake(page, (f) => f.drawingTool)).toBe(tool);
    await expect(page.locator("button[aria-pressed=true][data-kind=tool]")).toHaveCount(1);
  }
});

test("a key on an overlay moves the highlight", async ({ page }) => {
  await page.evaluate(`window.__fakeBridge.pretendDrawingTool("pen")`);
  await expect(button(page, "Pen")).toHaveAttribute("aria-pressed", "true");
});

test("Use apps hands the mouse over and a tool takes it back", async ({ page }) => {
  await button(page, "Use apps").click();
  await expect(button(page, "Use apps")).toHaveAttribute("aria-pressed", "true");
  await button(page, "Use apps").click();
  await expect(button(page, "Use apps")).toHaveAttribute("aria-pressed", "false");
  await button(page, "Use apps").click();
  await button(page, "Pen").click();
  await expect(button(page, "Use apps")).toHaveAttribute("aria-pressed", "false");
  expect(await fake(page, (f) => f.drawingClickThroughCalls)).toEqual([true, false, true, false]);
});

test("Undo follows what the overlays drew", async ({ page }) => {
  await expect(button(page, "Undo")).toBeDisabled();
  await page.evaluate(`window.__fakeBridge.pretendDrawingEdit({ monitor: 2, edit: "commit" })`);
  await expect(button(page, "Undo")).toBeEnabled();
  await button(page, "Undo").click();
  expect(await fake(page, (f) => f.drawingUndos)).toEqual([2]);
  await page.evaluate(`window.__fakeBridge.pretendDrawingEdit({ monitor: 2, edit: "undo" })`);
  await expect(button(page, "Undo")).toBeDisabled();
});

test("Collapse makes the small pill and a click on it expands again", async ({ page }) => {
  await button(page, "Collapse").click();
  expect(await fake(page, (f) => f.drawingToolbarSize)).toEqual({ width: 72, height: 48 });
  await expect(button(page, "Arrow")).toHaveCount(0);
  await expect(button(page, "Expand")).toBeVisible();
  await button(page, "Expand").click();
  expect(await fake(page, (f) => f.drawingToolbarSize)).toEqual({ width: 356, height: 48 });
  await expect(button(page, "Arrow")).toBeVisible();
});

test("Exit asks the platform to leave the mode", async ({ page }) => {
  await button(page, "Exit").click();
  expect(await fake(page, (f) => f.drawingExits)).toBe(1);
});

test("the pill fits its window with no scroll, on a transparent page", async ({ page }) => {
  const overflow = await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]);
  expect(overflow[0]).toBeLessThanOrEqual(0);
  expect(overflow[1]).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  const last = await button(page, "Exit").boundingBox();
  expect(last!.x + last!.width).toBeLessThanOrEqual(356);
});
