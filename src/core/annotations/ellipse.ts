// The Ellipse Annotation: the ellipse inscribed in its box, an outline (Stroke) with an optional Fill.
import { type BoxGeometry, boxFromDrag, DEFAULT_BOX_STYLE } from "./box";
import type { AnnotationKind } from "./kind";

export interface EllipseAnnotation extends BoxGeometry {
  type: "ellipse";
}

export const ellipseKind: AnnotationKind<EllipseAnnotation> = {
  type: "ellipse",
  label: "Ellipse",
  shortcutAction: "tool.ellipse",
  groups: ["stroke", "fill"],
  defaultStyle: DEFAULT_BOX_STYLE,
  fromDrag(id, from, to, style) {
    const box = boxFromDrag(id, from, to, style);
    return box && { ...box, type: "ellipse" };
  },
};
