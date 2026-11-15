import type { ArrowAnnotation } from "../../core/annotations/arrow";
import { ArrowShape } from "./arrowShape";
import type { ShapeAdapter } from "./shape";

export const arrowAdapter: ShapeAdapter<ArrowAnnotation> = {
  type: "arrow",
  create: (annotation) => new ArrowShape(annotation),
  update: (object, annotation) => (object as ArrowShape).setModel(annotation),
  read: (object) => {
    const { x1, y1, x2, y2 } = (object as ArrowShape).toModel();
    return { x1, y1, x2, y2 };
  },
};
