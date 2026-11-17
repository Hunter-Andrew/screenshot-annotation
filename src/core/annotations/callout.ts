// The Callout Annotation: text in a speech box with a pointer tail. It is a Text Annotation (the same
// box, wrapping and in-place typing) plus a Stroke and Fill for the speech box and a Tail switch.
// `tip` is where the tail points, as an offset from the text box's top-left corner, so the tail
// follows the box when it moves. Absent, the tail points at the default spot below the box.
import type { PropertyGroups, Style } from "../propertyGroups";
import { CALLOUT_TAIL_PERCENT, clampToRange } from "../../shared/imageSettings";
import { CALLOUT_PAD } from "./calloutGeometry";
import type { AnnotationKind, Point, Size } from "./kind";
import type { Run } from "./runs";
import { CLICK_SLOP, DEFAULT_WIDTH, MIN_AREA_WIDTH, textAreaFromDrag } from "./text";

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
  /** Per-selection styling, as for Text (see ./runs.ts); absent when none. */
  runs?: Run[];
  /** Tail tip as an offset from (x, y); absent until the user drags the tail. */
  tip?: Point;
}

interface Area extends Size {
  x?: number;
  y?: number;
}

/**
 * The text box and tail tip a drag draws with the tail on (Capture pixels). The press is the tip; the release is the
 * far corner of the speech box. The tail takes `tailPercent` of the press-to-release distance, measured along the
 * axis of the side that faces the tip (the one the drag runs along most), and the speech box takes the rest: it spans
 * from the release back to that fraction of the way from the press, and over the whole drag on the other axis, so the
 * press and the release are at opposite ends of the callout. The release is kept inside `area`; a box too narrow for
 * text gets the default width (it then slides to stay inside).
 */
function boxFromTailDrag(press: Point, release: Point, tailPercent: number, area: Area) {
  const left = area.x ?? 0;
  const top = area.y ?? 0;
  const right = left + area.width;
  const bottom = top + area.height;
  const inside = (p: Point): Point => ({ x: Math.min(right, Math.max(left, p.x)), y: Math.min(bottom, Math.max(top, p.y)) });
  const from = inside(press);
  const to = inside(release);
  const share = clampToRange(CALLOUT_TAIL_PERCENT, tailPercent) / 100;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const alongX = Math.abs(dx) >= Math.abs(dy);
  const nearX = from.x + dx * share;
  const nearY = from.y + dy * share;
  // The speech box's edges, then the text box inside its padding.
  const speechLeft = Math.min(alongX ? nearX : from.x, to.x);
  const speechRight = Math.max(alongX ? nearX : from.x, to.x);
  const speechTop = Math.min(alongX ? from.y : nearY, to.y);
  const speechBottom = Math.max(alongX ? from.y : nearY, to.y);
  let width = speechRight - speechLeft - 2 * CALLOUT_PAD;
  let x = speechLeft + CALLOUT_PAD;
  if (width < MIN_AREA_WIDTH) {
    // Too thin for text: the default width, from the tail's end (away from the press) or from the box's own left edge.
    width = DEFAULT_WIDTH;
    x = alongX && dx < 0 ? speechRight - CALLOUT_PAD - width : x;
  }
  width = Math.min(width, area.width);
  x = Math.max(left, Math.min(x, right - width));
  const minHeight = speechBottom - speechTop - 2 * CALLOUT_PAD;
  return { x, y: speechTop + CALLOUT_PAD, width, minHeight: minHeight >= CLICK_SLOP ? minHeight : 0 };
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
  keepsEmptyText: true,
  fromDrag(id, from, to, style: Style, area, options) {
    const base = calloutKind.defaultStyle;
    const capture = area ?? { width: Infinity, height: Infinity };
    const tail = style.tail ?? base.tail!;
    const dragged = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) >= CLICK_SLOP;
    // Tail on, dragged: the press is the tip and the release the far corner of the speech box; the tail takes
    // the Settings' percentage of the drag (see `boxFromTailDrag`). Tail off, or a click: a plain text area.
    const withTip = tail.enabled && dragged;
    const { x, y, width, minHeight } = withTip
      ? boxFromTailDrag(from, to, options?.tailPercent ?? CALLOUT_TAIL_PERCENT.default, capture)
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
