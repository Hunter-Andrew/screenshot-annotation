import type { LineAnnotation } from "../../core/annotations/line";
import { LineShape } from "./lineShape";
import type { ShapeAdapter } from "./shape";

export const lineAdapter: ShapeAdapter<LineAnnotation> = {
  type: "line",
  create: (annotation) => new LineShape(annotation),
  update: (object, annotation) => (object as LineShape).setModel(annotation),
  read: (object) => {
    const { x1, y1, x2, y2 } = (object as LineShape).toModel();
    return { x1, y1, x2, y2 };
  },
};
