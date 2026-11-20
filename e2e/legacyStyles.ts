import type { Page } from "@playwright/test";

/**
 * Starts the page with the Text and Callout styles the editor had before the 2026-11-19 defaults change (24 px / 20 px,
 * left aligned). For specs whose geometry (where a word sits, how tall a line is) was worked out for that layout, not
 * for the defaults themselves. Only seeds what is not stored yet, so a style the test changes survives a reload.
 */
export async function legacyTextStyles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = JSON.parse(localStorage.getItem("fake.toolStyles") ?? "{}");
    const font = { bold: false, italic: false, color: "#e02424", align: "left", valign: "middle", underline: false };
    const seeded = { text: { font: { ...font, size: 24 } }, callout: { font: { ...font, size: 20 } }, ...stored };
    localStorage.setItem("fake.toolStyles", JSON.stringify(seeded));
  });
}

/**
 * Arrow, Line, Rectangle and Ellipse return to Select after one use, as they did before they were made to keep drawing
 * (2026-11-19): for specs that draw a shape and then work on it, selected. Only seeds what is not stored yet.
 */
export async function shapesReturnToSelect(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = JSON.parse(localStorage.getItem("fake.toolStyles") ?? "{}");
    const toolBehavior = { arrow: true, line: true, rect: true, ellipse: true, ...stored.toolBehavior };
    localStorage.setItem("fake.toolStyles", JSON.stringify({ ...stored, toolBehavior }));
  });
}
