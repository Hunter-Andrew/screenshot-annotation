import type { PenAnnotation } from "../../core/annotations/pen";
import { PenShape } from "./penShape";
import type { ShapeAdapter } from "./shape";

export const penAdapter: ShapeAdapter<PenAnnotation> = {
  type: "pen",
  create: (annotation) => new PenShape(annotation),
  update: (object, annotation) => (object as PenShape).setModel(annotation),
  read: (object) => ({ points: (object as PenShape).toModel().points }),
};
