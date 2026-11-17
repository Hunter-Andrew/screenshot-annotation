import type { HighlightAnnotation } from "../../core/annotations/highlight";
import { PenShape } from "./penShape";
import type { ShapeAdapter } from "./shape";

export const highlightAdapter: ShapeAdapter<HighlightAnnotation> = {
  type: "highlight",
  create: (annotation) => new PenShape(annotation),
  update: (object, annotation) => (object as PenShape).setModel(annotation),
  read: (object) => ({ points: (object as PenShape).toModel().points }),
};
