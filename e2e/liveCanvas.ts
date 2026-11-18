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

export interface Spot {
  x: number;
  y: number;
}

/**
 * Where the Crop tool's handles are drawn on screen right now (page pixels, their centres), found from the
 * pixels: each handle is a small white square (its outline is anti-aliased, so the fill is what is matched). Needs a grey Capture and a
 * Transparent background (nothing else white and small), and any device scale. Both canvases are scanned (Fabric draws the
 * handles on whichever of them the overlay setting says).
 */
export async function cropHandles(page: Page): Promise<Spot[]> {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.evaluate(() => {
    const found: { x: number; y: number }[] = [];
    for (const canvas of Array.from(document.querySelectorAll<HTMLCanvasElement>(".canvas-container canvas"))) {
      const context = canvas.getContext("2d");
      if (!context || canvas.width === 0 || canvas.height === 0) continue;
      const box = canvas.getBoundingClientRect();
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Uint8Array(width * height);
      const isWhite = (i: number) => data[i * 4] === 255 && data[i * 4 + 1] === 255 && data[i * 4 + 2] === 255 && data[i * 4 + 3] === 255;
      for (let start = 0; start < width * height; start++) {
        if (seen[start] || !isWhite(start)) continue;
        let x1 = width;
        let y1 = height;
        let x2 = 0;
        let y2 = 0;
        let count = 0;
        const stack = [start];
        seen[start] = 1;
        while (stack.length > 0) {
          const i = stack.pop()!;
          count++;
          const x = i % width;
          const y = Math.floor(i / width);
          x1 = Math.min(x1, x);
          x2 = Math.max(x2, x);
          y1 = Math.min(y1, y);
          y2 = Math.max(y2, y);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            const n = ny * width + nx;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[n] || !isWhite(n)) continue;
            seen[n] = 1;
            stack.push(n);
          }
        }
        const [w, h] = [x2 - x1 + 1, y2 - y1 + 1];
        // A handle is a (nearly) filled square: not a letter's counter or a sliver of a white box.
        if (w >= 6 * (width / box.width) && w <= 11 * (width / box.width) && Math.abs(w - h) <= 1 && count >= 0.6 * w * h) found.push({ x: box.left + ((x1 + x2 + 1) / 2) * (box.width / width), y: box.top + ((y1 + y2 + 1) / 2) * (box.height / height) });
      }
    }
    return found;
  });
}

/** The eight places the Crop tool's handles belong: the corners and edge middles of the `.area` on screen. */
export async function expectedCropHandles(page: Page): Promise<Spot[]> {
  const box = (await page.locator(".area").boundingBox())!;
  const xs = [box.x, box.x + box.width / 2, box.x + box.width];
  const ys = [box.y, box.y + box.height / 2, box.y + box.height];
  return ys.flatMap((y, row) => xs.flatMap((x, col) => (row === 1 && col === 1 ? [] : [{ x, y }])));
}

/** True when the handles drawn are exactly the expected eight (each within `tolerance` px, none extra). */
export function sameSpots(found: Spot[], expected: Spot[], tolerance = 3): boolean {
  return (
    found.length === expected.length &&
    expected.every((want) => found.some((got) => Math.abs(got.x - want.x) <= tolerance && Math.abs(got.y - want.y) <= tolerance))
  );
}
