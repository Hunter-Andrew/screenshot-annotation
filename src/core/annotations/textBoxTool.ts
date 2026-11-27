// The Text box Annotation: text in a rounded box with a Stroke and Fill, and no tail. It is the Callout without its
// pointer, as its own tool (the Text tool is plain letters with no box). It is a Text Annotation (the same box,
// wrapping and in-place typing); `x`, `y` and `width` are the text box in Capture pixels, as for a Callout.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { AnnotationKind } from "./kind";
import type { Run } from "./runs";
import { textAreaFromDrag } from "./text";

export interface TextBoxAnnotation extends Pick<PropertyGroups, "font" | "textOutline" | "stroke" | "fill"> {
  id: string;
  type: "textbox";
  x: number;
  y: number;
  /** Wrap width of the text, in Capture pixels. */
  width: number;
  /** Lowest height of the text box (a dragged-out area); optional, as for Text. */
  minHeight?: number;
  text: string;
  /** Per-selection styling, as for Text (see ./runs.ts); absent when none. */
  runs?: Run[];
}

export const textBoxKind: AnnotationKind<TextBoxAnnotation> = {
  type: "textbox",
  label: "Text box",
  shortcutAction: "tool.textbox",
  groups: ["font", "textOutline", "stroke", "fill"],
  defaultStyle: {
    font: { size: 32, bold: false, italic: false, color: "#e02424", align: "center", valign: "middle", underline: false },
    textOutline: { enabled: false, color: "#ffffff", width: 2 },
    stroke: { color: "#e02424", width: 3 },
    fill: { mode: "solid", color: "#ffffff", opacity: 0.4 },
  },
  typedInPlace: true,
  keepsEmptyText: true,
  fromDrag(id, from, to, style: Style, area) {
    const base = textBoxKind.defaultStyle;
    const { x, y, width, minHeight } = textAreaFromDrag(from, to, area ?? { width: Infinity, height: Infinity });
    return {
      id,
      type: "textbox",
      x,
      y,
      width,
      ...(minHeight > 0 ? { minHeight } : {}),
      text: "",
      font: style.font ?? base.font!,
      textOutline: style.textOutline ?? base.textOutline!,
      stroke: style.stroke ?? base.stroke!,
      fill: style.fill ?? base.fill!,
    };
  },
};
