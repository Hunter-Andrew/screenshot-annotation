// The Text Annotation: a plain label typed straight onto the image. Red with a white outline by default.
// `x`, `y` and `width` are the box in Capture pixels; `width` is where lines wrap (changing it never
// changes the font size). The box's height follows from the text, but never below `minHeight`: the
// height of the area the user dragged out (ticket 35). Absent in images saved before that (and after
// a plain click), which means no minimum.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { AnnotationKind, Point, Size } from "./kind";

export interface TextAnnotation extends Pick<PropertyGroups, "font" | "textOutline"> {
  id: string;
  type: "text";
  x: number;
  y: number;
  /** Wrap width, in Capture pixels. */
  width: number;
  /** Lowest height of the box, in Capture pixels; it still grows downward as the text wraps. Optional (older images have none). */
  minHeight?: number;
  /** The words, with "\n" between lines. */
  text: string;
}

export const FONT_SIZE_PRESETS = [10, 12, 14, 18, 24, 32, 48, 72] as const;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;
export const MIN_OUTLINE_WIDTH = 1;
export const MAX_OUTLINE_WIDTH = 10;
/** Segoe UI only in v1 (spec); the fallback only matters where it is missing (tests, Linux). */
export const FONT_FAMILY = "'Segoe UI', sans-serif";

/** A typed font size made valid: a whole number from 8 to 200. */
export function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

/** Where lines wrap in a text box made by a click (a drag sets its own). */
const DEFAULT_WIDTH = 240;
/** A drag narrower than this is too thin to be an area: the default width is used instead. */
const MIN_AREA_WIDTH = 20;
/** Pointer movement (Capture pixels) under which a press is a click, not a drag. */
export const CLICK_SLOP = 4;

export interface TextArea {
  x: number;
  y: number;
  width: number;
  /** 0 when there is no minimum (a click, or a sliver of a drag). */
  minHeight: number;
}

/**
 * The starting area of a text box from a press at `from` and a release at `to` (Capture pixels), kept
 * inside `capture` (the visible area: it starts at the origin unless `x` and `y` say otherwise). Any direction works. A click, or a drag under 20 px wide, gets the
 * default width and no minimum height; otherwise the width is the wrap width and the height the box's
 * minimum height (it grows downward past it as text wraps).
 */
export function textAreaFromDrag(from: Point, to: Point, capture: Size & { x?: number; y?: number }): TextArea {
  const left = capture.x ?? 0;
  const top = capture.y ?? 0;
  const right = left + capture.width;
  const bottom = top + capture.height;
  const a = { x: Math.min(right, Math.max(left, from.x)), y: Math.min(bottom, Math.max(top, from.y)) };
  const b = { x: Math.min(right, Math.max(left, to.x)), y: Math.min(bottom, Math.max(top, to.y)) };
  const moved = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const dragged = Math.abs(b.x - a.x);
  const isArea = moved >= CLICK_SLOP && dragged >= MIN_AREA_WIDTH;
  const width = Math.min(isArea ? dragged : DEFAULT_WIDTH, capture.width);
  return {
    // A default-width box made near the right edge slides left so it stays inside.
    x: Math.max(left, Math.min(Math.min(a.x, b.x), right - width)),
    y: Math.min(a.y, b.y),
    width,
    minHeight: isArea ? Math.abs(b.y - a.y) : 0,
  };
}

export const textKind: AnnotationKind<TextAnnotation> = {
  type: "text",
  label: "Text",
  shortcutAction: "tool.text",
  groups: ["font", "textOutline"],
  defaultStyle: {
    font: { size: 24, bold: false, italic: false, color: "#e02424", align: "left" },
    textOutline: { enabled: true, color: "#ffffff", width: 2 },
  },
  typedInPlace: true,
  fromDrag(id, from, to, style: Style, area) {
    const base = textKind.defaultStyle;
    // Without the Capture's size (a bare call) nothing is clamped.
    const { x, y, width, minHeight } = textAreaFromDrag(from, to, area ?? { width: Infinity, height: Infinity });
    return {
      id,
      type: "text",
      x,
      y,
      width,
      ...(minHeight > 0 ? { minHeight } : {}),
      text: "",
      font: style.font ?? base.font!,
      textOutline: style.textOutline ?? base.textOutline!,
    };
  },
};
