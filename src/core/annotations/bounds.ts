// The padded bounding box the stroke-only Annotations (Arrow, Pen, Line) share.
import type { Point } from "./kind";

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The box around `points`, grown on every side by half the thickness plus 1 px (a square pad: generous at a slant, never short). */
export function strokeBounds(points: readonly Point[], thickness: number): Bounds {
  const pad = thickness / 2 + 1;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  return { left, top, width: Math.max(...xs) + pad - left, height: Math.max(...ys) + pad - top };
}
