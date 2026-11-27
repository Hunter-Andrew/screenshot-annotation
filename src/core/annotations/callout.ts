// The Callout Annotation: text in a speech box with a pointer tail. It is a Text Annotation (the same
// box, wrapping and in-place typing) plus a Stroke and Fill for the speech box. (The tailless version is the Text box.)
// `tip` is where the tail points, as an offset from the text box's top-left corner, so the tail
// follows the box when it moves. Absent, the tail points at the default spot below the box.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { TextBoxAnnotation } from "./textBoxTool";
import { CALLOUT_PAD } from "./calloutGeometry";
import type { AnnotationKind, Point, Size } from "./kind";
import type { Run } from "./runs";
import { CLICK_SLOP, DEFAULT_WIDTH, MIN_AREA_WIDTH, textAreaFromDrag } from "./text";

export interface CalloutAnnotation extends Pick<PropertyGroups, "font" | "textOutline" | "stroke" | "fill"> {
  id: string;
  type: "callout";
  x: number;
  y: number;
  /** Wrap width of the text, in Capture pixels. */
  width: number;
  /** Lowest height of the text box (a dragged-out area); optional, as for Text. */
  minHeight?: number;
  text: string;
  /** Per-selection styling, as for Text (see ./runs.ts); absent when none. */
  runs?: Run[];
  /** Tail tip as an offset from (x, y); absent until the user drags the tail. */
  tip?: Point;
  /**
   * Legacy: a Callout used to have a Tail switch. A saved one with `enabled: false` is a Text box now (see
   * `callout.migrate`, run when an image is read); the field is no longer written.
   */
  tail?: { enabled: boolean };
}

/** An older Callout whose tail was switched off is a Text box; everything else is returned as it is. */
export function tailOffToTextBox<A extends { type: string }>(annotation: A): A | TextBoxAnnotation {
  if (annotation.type !== "callout") return annotation;
  const callout = annotation as unknown as CalloutAnnotation;
  if (callout.tail?.enabled !== false) {
    if (!callout.tail) return annotation;
    const { tail: _legacy, ...rest } = callout;
    return rest as unknown as A;
  }
  const { tail: _off, tip: _tip, type: _type, ...rest } = callout;
  return { ...rest, type: "textbox" };
}

interface Area extends Size {
  x?: number;
  y?: number;
}

/** Lowest height of the text box a tail drag starts with (the box grows with its text past it). */
export const DEFAULT_CALLOUT_MIN_HEIGHT = 40;

/**
 * The text box a tail drag draws (Capture pixels). The press is the tip and the release is where the tail ends, which
 * is the corner of the speech box nearest the tip: the box extends from there away from the tip, in the direction the
 * drag ran (right and down for a drag that went right and down, and so on), at the default width and a default lowest
 * height that grows with the text. The release is kept inside `area`, and the box slides to stay inside it too.
 */
function boxFromTailDrag(press: Point, release: Point, area: Area) {
  const left = area.x ?? 0;
  const top = area.y ?? 0;
  const right = left + area.width;
  const bottom = top + area.height;
  const to: Point = { x: Math.min(right, Math.max(left, release.x)), y: Math.min(bottom, Math.max(top, release.y)) };
  const width = Math.max(MIN_AREA_WIDTH, Math.min(DEFAULT_WIDTH, area.width - 2 * CALLOUT_PAD));
  const minHeight = DEFAULT_CALLOUT_MIN_HEIGHT;
  const leftward = release.x < press.x;
  const upward = release.y < press.y;
  const x = leftward ? to.x - CALLOUT_PAD - width : to.x + CALLOUT_PAD;
  const y = upward ? to.y - CALLOUT_PAD - minHeight : to.y + CALLOUT_PAD;
  return {
    x: Math.max(left + CALLOUT_PAD, Math.min(x, right - CALLOUT_PAD - width)),
    y: Math.max(top + CALLOUT_PAD, Math.min(y, bottom - CALLOUT_PAD - minHeight)),
    width,
    minHeight,
  };
}

export const calloutKind: AnnotationKind<CalloutAnnotation> = {
  type: "callout",
  label: "Callout",
  shortcutAction: "tool.callout",
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
    const base = calloutKind.defaultStyle;
    const capture = area ?? { width: Infinity, height: Infinity };
    const dragged = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) >= CLICK_SLOP;
    // Dragged: the press is the tip and the release is where the tail ends, at the speech box's nearest
    // corner (see `boxFromTailDrag`). A click: a plain text area (the tail points at its default spot).
    const withTip = dragged;
    const { x, y, width, minHeight } = withTip
      ? boxFromTailDrag(from, to, capture)
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
    };
  },
};
