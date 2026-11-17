// The Callout Annotation: text in a speech box with a pointer tail. It is a Text Annotation (the same
// box, wrapping and in-place typing) plus a Stroke and Fill for the speech box and a Tail switch.
// `tip` is where the tail points, as an offset from the text box's top-left corner, so the tail
// follows the box when it moves. Absent, the tail points at the default spot below the box.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { AnnotationKind, Point } from "./kind";
import { CLICK_SLOP, textAreaFromDrag } from "./text";

export interface CalloutAnnotation extends Pick<PropertyGroups, "font" | "textOutline" | "stroke" | "fill" | "tail"> {
  id: string;
  type: "callout";
  x: number;
  y: number;
  /** Wrap width of the text, in Capture pixels. */
  width: number;
  /** Lowest height of the text box (a dragged-out area); optional, as for Text. */
  minHeight?: number;
  text: string;
  /** Tail tip as an offset from (x, y); absent until the user drags the tail. */
  tip?: Point;
}

export const calloutKind: AnnotationKind<CalloutAnnotation> = {
  type: "callout",
  label: "Callout",
  shortcutAction: "tool.callout",
  groups: ["font", "textOutline", "stroke", "fill", "tail"],
  defaultStyle: {
    font: { size: 20, bold: false, italic: false, color: "#e02424", align: "left", valign: "middle", underline: false },
    textOutline: { enabled: false, color: "#ffffff", width: 2 },
    stroke: { color: "#e02424", width: 3 },
    fill: { mode: "solid", color: "#ffffff", opacity: 0.4 },
    tail: { enabled: true },
  },
  typedInPlace: true,
  fromDrag(id, from, to, style: Style, area) {
    const base = calloutKind.defaultStyle;
    const capture = area ?? { width: Infinity, height: Infinity };
    const tail = style.tail ?? base.tail!;
    const dragged = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) >= CLICK_SLOP;
    // Tail on, dragged: the press is the tip and the release is the box corner nearest it; the box runs
    // on away from the press by the dragged distance (default width when that is too narrow).
    const withTip = tail.enabled && dragged;
    const { x, y, width, minHeight } = withTip
      ? textAreaFromDrag(to, { x: 2 * to.x - from.x, y: 2 * to.y - from.y }, capture)
      : textAreaFromDrag(from, to, capture);
    return {
      id,
      type: "callout",
      x,
      y,
      width,
      ...(minHeight > 0 ? { minHeight } : {}),
      ...(withTip ? { tip: { x: from.x - x, y: from.y - y } } : {}),
      text: "",
      font: style.font ?? base.font!,
      textOutline: style.textOutline ?? base.textOutline!,
      stroke: style.stroke ?? base.stroke!,
      fill: style.fill ?? base.fill!,
      tail,
    };
  },
};
