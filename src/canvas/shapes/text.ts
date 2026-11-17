import type { TextAnnotation } from "../../core/annotations/text";
import type { ShapeAdapter } from "./shape";
import { TextShape } from "./textShape";

export const textAdapter: ShapeAdapter<TextAnnotation> = {
  type: "text",
  create: (annotation) => new TextShape(annotation),
  update: (object, annotation) => (object as TextShape).setModel(annotation),
  beginEdit: (object) => (object as TextShape).beginEditing(),
  read: (object) => {
    const { x, y, width, text, minHeight, font } = (object as TextShape).toModel();
    return { x, y, width, text, font, ...(minHeight !== undefined ? { minHeight } : {}) };
  },
};
