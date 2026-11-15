// The Arrow Annotation: always straight (permanent decision), one head by default or both ends.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { AnnotationKind, Point } from "./kind";

export interface ArrowAnnotation extends Pick<PropertyGroups, "stroke" | "arrowheads"> {
  id: string;
  type: "arrow";
  /** Start point, in Capture pixels. */
  x1: number;
  y1: number;
  /** End point (the head of a one-head arrow). */
  x2: number;
  y2: number;
}

const MIN_LENGTH = 4;

export const arrowKind: AnnotationKind<ArrowAnnotation> = {
  type: "arrow",
  label: "Arrow",
  shortcutAction: "tool.arrow",
  groups: ["stroke", "arrowheads"],
  defaultStyle: { stroke: { color: "#e02424", width: 4 }, arrowheads: { ends: "end" } },
  fromDrag(id, from, to, style: Style) {
    if (Math.hypot(to.x - from.x, to.y - from.y) < MIN_LENGTH) return null;
    const base = arrowKind.defaultStyle;
    return {
      id,
      type: "arrow",
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      stroke: style.stroke ?? base.stroke!,
      arrowheads: style.arrowheads ?? base.arrowheads!,
    };
  },
};

export interface ArrowGeometry {
  /** The shaft, shortened so it ends where each head begins. */
  line: { x1: number; y1: number; x2: number; y2: number };
  /** Filled triangles: tip first, then the two base corners. */
  heads: Point[][];
}

/** Head length for a stroke width: 10 + 3 * width (22 px at the default width 4). */
function headLength(width: number): number {
  return 10 + 3 * width;
}

/** The one definition of how an Arrow looks; the canvas view and the Export renderer both draw it. */
export function arrowGeometry(arrow: ArrowAnnotation): ArrowGeometry {
  const dx = arrow.x2 - arrow.x1;
  const dy = arrow.y2 - arrow.y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const both = arrow.arrowheads.ends === "both";
  // Heads shrink on a short arrow so they never overshoot (two heads share the length).
  const head = Math.min(headLength(arrow.stroke.width), both ? length / 2 : length);
  const half = head * 0.4;

  const triangle = (tip: Point, direction: 1 | -1): Point[] => {
    const base = { x: tip.x - direction * ux * head, y: tip.y - direction * uy * head };
    return [
      tip,
      { x: base.x - uy * half, y: base.y + ux * half },
      { x: base.x + uy * half, y: base.y - ux * half },
    ];
  };

  const end = { x: arrow.x2, y: arrow.y2 };
  const start = { x: arrow.x1, y: arrow.y1 };
  const heads = [triangle(end, 1)];
  const line = { x1: arrow.x1, y1: arrow.y1, x2: arrow.x2 - ux * head, y2: arrow.y2 - uy * head };
  if (both) {
    heads.push(triangle(start, -1));
    line.x1 = arrow.x1 + ux * head;
    line.y1 = arrow.y1 + uy * head;
  }
  return { line, heads };
}

/** The box around everything an Arrow draws (shaft with its thickness, and the heads). */
export function arrowBounds(arrow: ArrowAnnotation): { left: number; top: number; width: number; height: number } {
  const { heads } = arrowGeometry(arrow);
  const pad = arrow.stroke.width / 2 + 1;
  const points = [
    { x: arrow.x1, y: arrow.y1 },
    { x: arrow.x2, y: arrow.y2 },
    ...heads.flat(),
  ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  return { left, top, width: Math.max(...xs) + pad - left, height: Math.max(...ys) + pad - top };
}
