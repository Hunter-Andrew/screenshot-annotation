// Crop gestures (ticket 21). Pure TypeScript.
//
// The Crop (`model.crop`) is a plain rectangle, the visible area, in Capture pixels. Since ticket 37 it
// may also extend past the Capture (canvas expansion), so nothing may assume it lies inside the Capture;
// the 8192 px limit and the background live in area.ts.
import type { Crop } from "./annotation";

/** Smallest Crop edge (px) a drag may produce: a click or a sliver is not a Crop. */
export const MIN_CROP = 8;

export interface Point {
  x: number;
  y: number;
}

/**
 * The Crop a drag from `from` to `to` makes, in whole pixels, or null when either edge is under MIN_CROP.
 * Not clamped to the Capture: a rectangle drawn past its edge expands the image (ticket 37); the size
 * limit is applied when it is set as the area (area.ts).
 */
export function cropFromDrag(from: Point, to: Point): Crop | null {
  const x1 = Math.round(Math.min(from.x, to.x));
  const x2 = Math.round(Math.max(from.x, to.x));
  const y1 = Math.round(Math.min(from.y, to.y));
  const y2 = Math.round(Math.max(from.y, to.y));
  if (x2 - x1 < MIN_CROP || y2 - y1 < MIN_CROP) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export const sameCrop = (a: Crop | null, b: Crop | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
