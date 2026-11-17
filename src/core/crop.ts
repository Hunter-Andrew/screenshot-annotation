// Crop gestures (ticket 21). Pure TypeScript.
//
// The Crop (`model.crop`) is a plain rectangle, the visible area, in Capture pixels. It is kept a plain
// rectangle on purpose: ticket 37 (canvas expansion) can later let it extend past the Capture, so
// nothing outside this file should assume it lies inside the Capture.
import type { Crop } from "./annotation";

/** Smallest Crop edge (px) a drag may produce: a click or a sliver is not a Crop. */
export const MIN_CROP = 8;

export interface Point {
  x: number;
  y: number;
}

/**
 * The Crop a drag from `from` to `to` makes, in whole pixels and clamped to the Capture, or null when
 * either edge is under MIN_CROP.
 */
export function cropFromDrag(from: Point, to: Point, capture: { width: number; height: number }): Crop | null {
  const clamp = (v: number, max: number) => Math.min(Math.max(Math.round(v), 0), max);
  const x1 = clamp(Math.min(from.x, to.x), capture.width);
  const x2 = clamp(Math.max(from.x, to.x), capture.width);
  const y1 = clamp(Math.min(from.y, to.y), capture.height);
  const y2 = clamp(Math.max(from.y, to.y), capture.height);
  if (x2 - x1 < MIN_CROP || y2 - y1 < MIN_CROP) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export const sameCrop = (a: Crop | null, b: Crop | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
