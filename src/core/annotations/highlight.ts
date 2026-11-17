// The Highlighter Annotation: a wide freehand stroke drawn with a multiply blend (like a marker: dark text
// stays dark, white text on a dark ground comes out in the marker's colour), bright yellow at 100% by default.
// It is a Pen stroke with an Opacity group, drawn by the same shape (the whole stroke at one opacity, so
// overlaps inside one stroke do not darken). Holding Shift while drawing makes a straight horizontal stroke.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { AnnotationKind, Point } from "./kind";
import { decimate } from "./pen";

export interface HighlightAnnotation extends Pick<PropertyGroups, "stroke" | "opacity"> {
  id: string;
  type: "highlight";
  /** The stroke's points in order, in Capture pixels (at least 2). */
  points: Point[];
}

const MIN_POINT_DISTANCE = 2;

export const highlightKind: AnnotationKind<HighlightAnnotation> = {
  type: "highlight",
  label: "Highlighter",
  shortcutAction: "tool.highlight",
  groups: ["stroke", "opacity"],
  defaultStyle: { stroke: { color: "#ffee00", width: 20 }, opacity: { value: 1 } },
  horizontalWithShift: true,
  fromPath(id, points, style: Style) {
    const first = points[0];
    if (!first) return null;
    const stroke = style.stroke ?? highlightKind.defaultStyle.stroke!;
    const opacity = style.opacity ?? highlightKind.defaultStyle.opacity!;
    const kept = decimate(points, MIN_POINT_DISTANCE);
    // A click without movement draws nothing: a highlighter dot is almost always an accident.
    if (kept.length < 2 || kept.every((p) => p.x === first.x && p.y === first.y)) return null;
    return { id, type: "highlight", points: kept, stroke, opacity };
  },
  fromDrag(id, from, to, style: Style) {
    return highlightKind.fromPath!(id, [from, to], style);
  },
};
