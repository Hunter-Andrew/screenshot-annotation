// The Text Annotation: a plain label typed straight onto the image. Red with a white outline by default.
// `x`, `y` and `width` are the box in Capture pixels; `width` is where lines wrap (changing it never
// changes the font size). The box's height follows from the text, so it is not stored.
import type { PropertyGroups, Style } from "../propertyGroups";
import type { AnnotationKind } from "./kind";

export interface TextAnnotation extends Pick<PropertyGroups, "font" | "textOutline"> {
  id: string;
  type: "text";
  x: number;
  y: number;
  /** Wrap width, in Capture pixels. */
  width: number;
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
/** A drag narrower than this is a click. */
const MIN_DRAG_WIDTH = 24;

export const textKind: AnnotationKind<TextAnnotation> = {
  type: "text",
  label: "Text",
  shortcutAction: "tool.text",
  groups: ["font", "textOutline"],
  defaultStyle: {
    font: { size: 24, bold: false, italic: false, color: "#e02424" },
    textOutline: { enabled: true, color: "#ffffff", width: 2 },
  },
  typedInPlace: true,
  fromDrag(id, from, to, style: Style, area) {
    const base = textKind.defaultStyle;
    const dragged = Math.abs(to.x - from.x);
    let width = dragged >= MIN_DRAG_WIDTH ? dragged : DEFAULT_WIDTH;
    let x = Math.min(from.x, to.x);
    if (area) {
      // Inside the Capture: narrow the box if it must be, then slide it left from the edge.
      width = Math.min(width, area.width);
      x = Math.max(0, Math.min(x, area.width - width));
    }
    return {
      id,
      type: "text",
      x,
      y: Math.min(from.y, to.y),
      width,
      text: "",
      font: style.font ?? base.font!,
      textOutline: style.textOutline ?? base.textOutline!,
    };
  },
};
