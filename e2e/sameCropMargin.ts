import type { TestType } from "@playwright/test";

/**
 * For the specs that test Crop mechanics at fixed screen positions: while the Crop tool is on the view keeps the
 * "Canvas margin during crop" (default 150) instead of the Canvas margin (default 16) and re-fits, which moves
 * the canvas under a coordinate measured before the tool was picked. These specs keep the earlier 48 px margins for both (the Canvas margin default is now 16) and make them equal;
 * e2e/m4settings.spec.ts covers the margin change itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function legacyMargins(test: TestType<any, any>) {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("fake.imageSettings", JSON.stringify({ canvasMargin: 48, cropMargin: 48 }));
      } catch {
        // storage unavailable: the spec runs with the defaults
      }
    });
  });
}
