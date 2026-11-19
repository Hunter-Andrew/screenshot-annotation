import type { Page } from "@playwright/test";

/**
 * Starts the page with the Text and Callout styles the editor had before the 2026-11-19 defaults change (24 px / 20 px,
 * left aligned). For specs whose geometry (where a word sits, how tall a line is) was worked out for that layout, not
 * for the defaults themselves. Only seeds an empty store, so a style the test changes survives a reload.
 */
export async function legacyTextStyles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem("fake.toolStyles")) return;
    const font = { bold: false, italic: false, color: "#e02424", align: "left", valign: "middle", underline: false };
    localStorage.setItem(
      "fake.toolStyles",
      JSON.stringify({ text: { font: { ...font, size: 24 } }, callout: { font: { ...font, size: 20 } } }),
    );
  });
}
