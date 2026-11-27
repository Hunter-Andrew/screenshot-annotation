import type { CalloutAnnotation } from "../../core/annotations/callout";
import type { TextBoxAnnotation } from "../../core/annotations/textBoxTool";
import { CalloutShape } from "./calloutShape";
import type { ShapeAdapter } from "./shape";

/** One adapter for both boxed kinds: they are the same shape, and a Text box just has no tail. */
function boxedAdapter<A extends CalloutAnnotation | TextBoxAnnotation>(type: A["type"]): ShapeAdapter<A> {
  return {
    type,
    create: (annotation) => new CalloutShape(annotation),
    update: (object, annotation) => (object as CalloutShape).setCallout(annotation),
    beginEdit: (object) => (object as CalloutShape).beginEditing(),
    read: (object) => {
      const shape = object as CalloutShape;
      const { x, y, width, text, minHeight, font, ...rest } = shape.toCallout();
      const tip = "tip" in rest ? rest.tip : undefined;
      return {
        x,
        y,
        width,
        text,
        font,
        ...shape.runsPatch(),
        ...(minHeight !== undefined ? { minHeight } : {}),
        ...(tip ? { tip } : {}),
      } as Partial<A>;
    },
  };
}

export const calloutAdapter = boxedAdapter<CalloutAnnotation>("callout");
export const textBoxAdapter = boxedAdapter<TextBoxAnnotation>("textbox");
