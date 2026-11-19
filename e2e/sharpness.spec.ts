import { expect, test } from "@playwright/test";

// At a zoom like 72% the canvas must be a whole number of device pixels, or the browser stretches it after it was drawn
// and the whole picture goes soft (reported 2026-11-19). Checked at a normal and at a 125% display scale; layout works in 1/64 px, hence the tolerance.
for (const deviceScaleFactor of [1, 1.25]) {
  test(`the canvas is shown pixel for pixel at Fit (display scale ${deviceScaleFactor})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1100, height: 720 }, deviceScaleFactor });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForFunction(() => Boolean((window as unknown as { __fakeBridge?: unknown }).__fakeBridge));
    await page.evaluate(() => {
      const [width, height] = [1600, 1000];
      (window as unknown as { __fakeBridge: { simulateCapture(s: unknown): void } }).__fakeBridge.simulateCapture({ width, height, rgba: new Uint8Array(width * height * 4).fill(200) });
    });
    await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
    await page.locator(".canvas-host canvas").first().waitFor();
    await page.waitForTimeout(300);
    const sizes = await page.evaluate(() => {
      const canvas = document.querySelector(".canvas-host canvas.lower-canvas, .canvas-host canvas") as HTMLCanvasElement;
      const box = canvas.getBoundingClientRect();
      return { dpr: window.devicePixelRatio, deviceWidth: box.width * window.devicePixelRatio, deviceHeight: box.height * window.devicePixelRatio, width: canvas.width, height: canvas.height };
    });
    expect(Math.abs(sizes.deviceWidth - sizes.width)).toBeLessThan(0.05);
    expect(Math.abs(sizes.deviceHeight - sizes.height)).toBeLessThan(0.05);
    await context.close();
  });
}
