// The Line Annotation: a straight segment with a Stroke, no heads (an Arrow without them).
import type { PropertyGroups, Style } from "../propertyGroups";
import type { AnnotationKind } from "./kind";

export interface LineAnnotation extends Pick<PropertyGroups, "stroke"> {
  id: string;
  type: "line";
  /** Start and end points, in Capture pixels. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const MIN_LENGTH = 4;

export const lineKind: AnnotationKind<LineAnnotation> = {
  type: "line",
  label: "Line",
  shortcutAction: "tool.line",
  groups: ["stroke"],
  defaultStyle: { stroke: { color: "#e02424", width: 4 } },
  fromDrag(id, from, to, style: Style) {
    if (Math.hypot(to.x - from.x, to.y - from.y) < MIN_LENGTH) return null;
    return {
      id,
      type: "line",
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      stroke: style.stroke ?? lineKind.defaultStyle.stroke!,
    };
  },
};

/** The box around a Line with its thickness (a square pad: generous at a slant, never short). */
export function lineBounds(line: LineAnnotation): { left: number; top: number; width: number; height: number } {
  const pad = line.stroke.width / 2 + 1;
  const left = Math.min(line.x1, line.x2) - pad;
  const top = Math.min(line.y1, line.y2) - pad;
  return {
    left,
    top,
    width: Math.max(line.x1, line.x2) + pad - left,
    height: Math.max(line.y1, line.y2) + pad - top,
  };
}
