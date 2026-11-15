// The Rectangle Annotation: an outline (Stroke) with an optional Fill.
import { type BoxGeometry, boxFromDrag, DEFAULT_BOX_STYLE } from "./box";
import type { AnnotationKind } from "./kind";

export interface RectAnnotation extends BoxGeometry {
  type: "rect";
}

export const rectKind: AnnotationKind<RectAnnotation> = {
  type: "rect",
  label: "Rectangle",
  shortcutAction: "tool.rect",
  groups: ["stroke", "fill"],
  defaultStyle: DEFAULT_BOX_STYLE,
  fromDrag(id, from, to, style) {
    const box = boxFromDrag(id, from, to, style);
    return box && { ...box, type: "rect" };
  },
};
