// The Pen Annotation: a freehand stroke. The model keeps the captured points (thinned out), never a
// Fabric path (ADR 0005). Smoothing happens when drawing, by `smoothPath`, which the canvas view and
// the Export renderer both use, so what you see is what you copy.
import { DEFAULT_ERASER_SIZE, type PropertyGroups, type Style } from "../propertyGroups";
import { type Bounds, strokeBounds } from "./bounds";
import type { AnnotationKind, Point } from "./kind";

export interface PenAnnotation extends Pick<PropertyGroups, "stroke"> {
  id: string;
  type: "pen";
  /** The stroke's points in order, in Capture pixels (at least 2). */
  points: Point[];
}

/** A stroke that travels less than this (a click, a twitch) is a dot at where it began. */
const MIN_TRAVEL = 4;
/** Captured points closer than this to the last kept one are dropped. */
const MIN_POINT_DISTANCE = 2;

/** Drop points closer than `minDistance` to the last kept point; the first and last always stay. */
export function decimate(points: readonly Point[], minDistance: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const kept = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const last = kept[kept.length - 1]!;
    const p = points[i]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDistance) kept.push(p);
  }
  kept.push(points[points.length - 1]!);
  return kept;
}

export type PathSegment =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "Q"; cx: number; cy: number; x: number; y: number };

/**
 * The light smoothing: a quadratic curve through the midpoints of consecutive points, with each inner
 * point as the control point. It starts and ends exactly on the first and last point.
 */
export function smoothPath(points: readonly Point[]): PathSegment[] {
  if (points.length === 0) return [];
  const first = points[0]!;
  const path: PathSegment[] = [{ op: "M", x: first.x, y: first.y }];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const next = points[i + 1]!;
    path.push({ op: "Q", cx: p.x, cy: p.y, x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 });
  }
  if (points.length > 1) {
    const last = points[points.length - 1]!;
    path.push({ op: "L", x: last.x, y: last.y });
  }
  return path;
}

function travel(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return total;
}

export const penKind: AnnotationKind<PenAnnotation> = {
  type: "pen",
  label: "Pen",
  shortcutAction: "tool.pen",
  groups: ["stroke"],
  // Pen or Eraser mode and the eraser's size: remembered with the tool's style, but not part of a stroke (ADR 0005 is unchanged).
  toolGroups: ["eraser"],
  defaultStyle: { stroke: { color: "#e02424", width: 4 }, eraser: { mode: "pen", size: DEFAULT_ERASER_SIZE } },
  fromPath(id, points, style: Style) {
    const first = points[0];
    if (!first) return null;
    const stroke = style.stroke ?? penKind.defaultStyle.stroke!;
    const kept = decimate(points, MIN_POINT_DISTANCE);
    // A quick click (or a twitch) makes a dot: two identical points, which the round line caps draw as a disc.
    if (kept.length < 2 || travel(kept) < MIN_TRAVEL) return { id, type: "pen", points: [{ ...first }, { ...first }], stroke };
    return { id, type: "pen", points: kept, stroke };
  },
  fromDrag(id, from, to, style: Style) {
    return penKind.fromPath!(id, [from, to], style);
  },
};

/** The box around the stroke, thickness included. */
export function penBounds(pen: Pick<PenAnnotation, "points" | "stroke">): Bounds {
  return strokeBounds(pen.points, pen.stroke.width);
}
