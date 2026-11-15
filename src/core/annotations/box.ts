// What Rectangle and Ellipse share: an axis-aligned box (x, y, width, height in Capture pixels, the
// middle of the outline) with a Stroke and a Fill.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { Point } from "./kind";

export interface BoxGeometry extends Pick<PropertyGroups, "stroke" | "fill"> {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_BOX_STYLE: Required<Pick<Style, "stroke" | "fill">> = {
  stroke: { color: "#e02424", width: 4 },
  fill: { mode: "none", color: "#facc15", opacity: 0.4 },
};

const MIN_SIDE = 4;

/** The box a drag from `from` to `to` draws, or null for a click (neither side reaches 4 px). */
export function boxFromDrag(id: string, from: Point, to: Point, style: Style): BoxGeometry | null {
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  if (Math.max(width, height) < MIN_SIDE) return null;
  return {
    id,
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width,
    height,
    stroke: style.stroke ?? DEFAULT_BOX_STYLE.stroke,
    fill: style.fill ?? DEFAULT_BOX_STYLE.fill,
  };
}
