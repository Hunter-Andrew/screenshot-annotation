// The Text box Annotation: text in a rounded box with a Stroke and Fill, and no tail. It is the Callout without its
// pointer, as its own tool (the Text tool is plain letters with no box). It is a Text Annotation (the same box,
// wrapping and in-place typing); `x`, `y` and `width` are the text box in Capture pixels, as for a Callout.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { AnnotationKind, DrawOptions } from "./kind";
import type { Run } from "./runs";
import { DEFAULT_WIDTH, textAreaFromDrag, type TextArea } from "./text";

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

/** The width a Text box is placed at with no minimum set and no drag: what a click makes (that of a placed Callout). */
export const DEFAULT_TEXT_BOX_WIDTH = DEFAULT_WIDTH;

/**
 * The area a press at `from` and a release at `to` place a Text box in, widened to `minWidth` (0: no minimum) when it
 * is narrower. Only the PLACEMENT is widened, never a box that exists. It grows away from the press: a drag that went
 * left keeps its right edge, any other keeps its left edge; the box then slides to stay inside `capture` (the visible
 * area), and is no wider than it.
 */
export function textBoxAreaFromDrag(
  from: { x: number; y: number },
  to: { x: number; y: number },
  capture: { x?: number; y?: number; width: number; height: number },
  minWidth = 0,
): TextArea {
  const area = textAreaFromDrag(from, to, capture);
  if (area.width >= minWidth) return area;
  const left = capture.x ?? 0;
  const right = left + capture.width;
  const width = Math.min(minWidth, capture.width);
  const leftward = to.x < from.x && area.minHeight > 0;
  const x = leftward ? area.x + area.width - width : area.x;
  return { ...area, width, x: Math.max(left, Math.min(x, right - width)) };
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
  fromDrag(id, from, to, style: Style, area, options?: DrawOptions) {
    const base = textBoxKind.defaultStyle;
    const { x, y, width, minHeight } = textBoxAreaFromDrag(from, to, area ?? { width: Infinity, height: Infinity }, options?.textBoxMinWidth ?? 0);
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
