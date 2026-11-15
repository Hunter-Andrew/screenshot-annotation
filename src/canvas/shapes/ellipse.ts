import type { EllipseAnnotation } from "../../core/annotations/ellipse";
import { createEllipse, readBox, showBox } from "./boxShapes";
import type { ShapeAdapter } from "./shape";

export const ellipseAdapter: ShapeAdapter<EllipseAnnotation> = {
  type: "ellipse",
  create: createEllipse,
  update: showBox,
  read: readBox,
};
