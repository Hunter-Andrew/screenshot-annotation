import type { RectAnnotation } from "../../core/annotations/rect";
import { createRect, readBox, showBox } from "./boxShapes";
import type { ShapeAdapter } from "./shape";

export const rectAdapter: ShapeAdapter<RectAnnotation> = {
  type: "rect",
  create: createRect,
  update: showBox,
  read: readBox,
};
