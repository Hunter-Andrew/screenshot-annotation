import type { Page } from "@playwright/test";

/**
 * The pixels of what the editor canvas is showing right now, for a rectangle of the visible area (default:
 * all of it), in the area's own pixels. Since ticket 37 the canvas also covers the dark margin around the
 * visible area, so its pixel (0, 0) is no longer the area's corner; this finds the corner on screen.
 * Needs 100% zoom (one canvas pixel per image pixel) and a device scale of 1. Null while there is no canvas
 * (it is rebuilt after an image is reopened): poll until it is there.
 */
export async function liveArea(
  page: Page,
  rect?: { x: number; y: number; w: number; h: number },
): Promise<{ width: number; height: number; data: number[] } | null> {
  // Let a change repaint first: Fabric renders on the next animation frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.evaluate((wanted) => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.lower-canvas");
    const context = canvas?.getContext("2d");
    const area = document.querySelector(".area")?.getBoundingClientRect();
    if (!canvas || !context || !area) return null;
    const box = canvas.getBoundingClientRect();
    const left = Math.round(area.left - box.left);
    const top = Math.round(area.top - box.top);
    const r = wanted ?? { x: 0, y: 0, w: Math.round(area.width), h: Math.round(area.height) };
    const { data, width, height } = context.getImageData(left + r.x, top + r.y, r.w, r.h);
    return { width, height, data: Array.from(data) };
  }, rect);
}
