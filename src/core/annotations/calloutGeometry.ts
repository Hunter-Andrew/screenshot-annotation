// The outline of a Callout: a rounded box around its text with an optional pointed tail. Pure geometry
// (Capture pixels), shared by the canvas shape and tested on its own.
import type { Point } from "./kind";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Space between the text and the edge of the speech box. */
export const CALLOUT_PAD = 10;
/** Corner radius of the speech box. */
export const CALLOUT_RADIUS = 8;
/** Half the width of the tail where it leaves the box. */
const TAIL_HALF_BASE = 12;

export type Side = "top" | "right" | "bottom" | "left";

/** Where the tip goes when the user has not dragged it: just below the box, near its left side. */
export function defaultTip(box: Pick<Box, "width" | "height">): Point {
  return { x: Math.min(32, box.width / 4), y: box.height + 32 };
}

/** The speech box: the text box grown by the padding on every side. */
export function bubbleBox(textBox: Box): Box {
  return {
    left: textBox.left - CALLOUT_PAD,
    top: textBox.top - CALLOUT_PAD,
    width: textBox.width + CALLOUT_PAD * 2,
    height: textBox.height + CALLOUT_PAD * 2,
  };
}

export interface Tail {
  side: Side;
  /** The two points where the tail meets the box edge, in clockwise order. */
  base: [Point, Point];
  tip: Point;
}

/**
 * The tail from `box` to `tip`, or null when the tip is inside the box (nothing to point out of it) or
 * the box is too small to carry one. It leaves from the side the tip lies beyond (the larger overshoot
 * wins) and its base is centred on the tip's projection onto that side, kept clear of the rounded corners.
 */
export function tailTo(box: Box, tip: Point): Tail | null {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const over = {
    left: box.left - tip.x,
    right: tip.x - right,
    top: box.top - tip.y,
    bottom: tip.y - bottom,
  };
  const side = (Object.keys(over) as Side[]).reduce((best, s) => (over[s] > over[best] ? s : best), "top" as Side);
  if (over[side] <= 0) return null;
  const horizontal = side === "top" || side === "bottom";
  const length = horizontal ? box.width : box.height;
  const start = horizontal ? box.left : box.top;
  const room = length / 2 - CALLOUT_RADIUS;
  if (room < 2) return null;
  const half = Math.min(TAIL_HALF_BASE, room);
  const along = horizontal ? tip.x : tip.y;
  const centre = Math.min(start + length - CALLOUT_RADIUS - half, Math.max(start + CALLOUT_RADIUS + half, along));
  const a = centre - half;
  const b = centre + half;
  const base: [Point, Point] =
    side === "top"
      ? [{ x: a, y: box.top }, { x: b, y: box.top }]
      : side === "bottom"
        ? [{ x: b, y: bottom }, { x: a, y: bottom }]
        : side === "left"
          ? [{ x: box.left, y: b }, { x: box.left, y: a }]
          : [{ x: right, y: a }, { x: right, y: b }];
  return { side, base, tip };
}

/** The corner points of the outline, clockwise from the top-left, with the tail's three points on its side. */
export function outlinePoints(box: Box, tail: Tail | null): Point[] {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const corners: Record<Side, Point[]> = {
    top: [{ x: box.left, y: box.top }],
    right: [{ x: right, y: box.top }],
    bottom: [{ x: right, y: bottom }],
    left: [{ x: box.left, y: bottom }],
  };
  // Each corner is followed by what lies along the edge that starts there (top-left -> along the top edge, ...).
  const edgeAfter: Record<Side, Point[]> = { top: [], right: [], bottom: [], left: [] };
  if (tail) edgeAfter[tail.side] = [tail.base[0], tail.tip, tail.base[1]];
  const order: Side[] = ["top", "right", "bottom", "left"];
  return order.flatMap((s) => [...corners[s], ...edgeAfter[s]]);
}

export type PathOp = { op: "M"; x: number; y: number } | { op: "L"; x: number; y: number } | { op: "A"; x1: number; y1: number; x2: number; y2: number; r: number };

/**
 * The outline as path operations: straight edges, rounded box corners (`arcTo`) and sharp tail points.
 * `box` is the speech box; the path is closed (the caller calls closePath).
 */
export function outlinePath(box: Box, tail: Tail | null): PathOp[] {
  const pts = outlinePoints(box, tail);
  const isCorner = (p: Point) =>
    (p.x === box.left || p.x === box.left + box.width) && (p.y === box.top || p.y === box.top + box.height);
  const ops: PathOp[] = [];
  const n = pts.length;
  // Start on the middle of the segment leaving the first corner, so every corner can be rounded.
  const first = pts[0]!;
  const second = pts[1]!;
  ops.push({ op: "M", x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n]!;
    const next = pts[(i + 1) % n]!;
    if (isCorner(p) && !(p.x === tail?.tip.x && p.y === tail?.tip.y)) ops.push({ op: "A", x1: p.x, y1: p.y, x2: (p.x + next.x) / 2, y2: (p.y + next.y) / 2, r: CALLOUT_RADIUS });
    else ops.push({ op: "L", x: p.x, y: p.y });
  }
  return ops;
}
