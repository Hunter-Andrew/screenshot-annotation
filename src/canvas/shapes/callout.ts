import type { CalloutAnnotation } from "../../core/annotations/callout";
import { CalloutShape } from "./calloutShape";
import type { ShapeAdapter } from "./shape";

export const calloutAdapter: ShapeAdapter<CalloutAnnotation> = {
  type: "callout",
  create: (annotation) => new CalloutShape(annotation),
  update: (object, annotation) => (object as CalloutShape).setCallout(annotation),
  beginEdit: (object) => (object as CalloutShape).beginEditing(),
  read: (object) => {
    const { x, y, width, text, minHeight, tip, font } = (object as CalloutShape).toCallout();
    return { x, y, width, text, font, ...(minHeight !== undefined ? { minHeight } : {}), ...(tip ? { tip } : {}) };
  },
};
