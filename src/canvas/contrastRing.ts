// The outline circle that follows the pointer for the Eraser and the Highlighter: a dark line with a thinner white one
// on top, so it can be seen on a white Capture and on a black one, whatever colour the tool is.
import type { Point } from "../core/annotations";

/**
 * Stroke a circle of `radius` at `at` (in the context's current units). `pixel` is one screen pixel in those units, so
 * the lines stay 3 and 1.5 screen pixels wide at any zoom.
 */
export function strokeContrastRing(ctx: CanvasRenderingContext2D, at: Point, radius: number, pixel: number): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 3 * pixel;
  ctx.strokeStyle = "rgba(17, 24, 39, 0.9)";
  ctx.stroke();
  ctx.lineWidth = 1.5 * pixel;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}
