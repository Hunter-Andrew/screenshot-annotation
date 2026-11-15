// The shared property groups of the Annotation model (ADR 0005). Each tool opts into the groups it
// uses (`AnnotationKind.groups`); an Annotation stores each group it uses under the group's key.
//
// To add a group (tickets 10 and 11): declare its value type here, add it to `PropertyGroups`, and
// register its Style panel editor in `src/editor/style/groups.tsx`.

/** Stroke thickness limits in Capture pixels: the Style panel and the stored-style reader share them. */
export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 30;

export interface Stroke {
  /** CSS hex color, e.g. "#e02424". Strokes are always solid. */
  color: string;
  /** MIN_STROKE_WIDTH-MAX_STROKE_WIDTH (1-30) px, in Capture pixels. */
  width: number;
}

export interface Arrowheads {
  /** "end": one head at the end point (the default). "both": a head at each end. */
  ends: "end" | "both";
}

export interface Font {
  /** 8-200 px, in Capture pixels. */
  size: number;
  bold: boolean;
  italic: boolean;
  /** The text's own color (CSS hex). Segoe UI is the only family in v1, so there is no family field. */
  color: string;
}

export interface TextOutline {
  /** Text is red with a white outline by default; the outline can be switched off. */
  enabled: boolean;
  color: string;
  /** How far the outline reaches past the letters, 1-10 px in Capture pixels. */
  width: number;
}

export interface Fill {
  /** "none": see-through. "solid": the color, opaque. "semi": the color at `opacity`. */
  mode: "none" | "solid" | "semi";
  /** CSS hex color, e.g. "#facc15". Kept while the mode is "none", so switching back restores it. */
  color: string;
  /** 0-1; only used by "semi". */
  opacity: number;
}

export interface PropertyGroups {
  stroke: Stroke;
  arrowheads: Arrowheads;
  fill: Fill;
  font: Font;
  textOutline: TextOutline;
}

export type GroupId = keyof PropertyGroups;

/** A (possibly partial) set of group values: a tool's default style, or a restyle patch. */
export type Style = Partial<PropertyGroups>;

/** The CSS color a Fill paints with, or null when it paints nothing. The one definition the canvas and the Export share. */
export function fillPaint(fill: Fill): string | null {
  if (fill.mode === "none") return null;
  const alpha = fill.mode === "solid" ? 1 : fill.opacity;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fill.color.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- reading a stored style (settings.json holds each tool's last style) --------------------------

import { MAX_FONT_SIZE, MAX_OUTLINE_WIDTH, MIN_FONT_SIZE, MIN_OUTLINE_WIDTH } from "./annotations/text";

export const HEX = /^#[0-9a-fA-F]{6}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The stored object with a valid hex `color`, or undefined: the start of every reader of a group that has a color. */
const readColor = (raw: unknown): (Record<string, unknown> & { color: string }) | undefined =>
  isRecord(raw) && typeof raw.color === "string" && HEX.test(raw.color) ? (raw as Record<string, unknown> & { color: string }) : undefined;

/** One reader per group: the valid value, or undefined to drop it. A new group adds one entry. */
const GROUP_READERS: { [K in GroupId]: (raw: unknown) => PropertyGroups[K] | undefined } = {
  stroke: (raw) => {
    const stored = readColor(raw);
    if (!stored || typeof stored.width !== "number") return;
    const width = Math.round(stored.width);
    return width >= MIN_STROKE_WIDTH && width <= MAX_STROKE_WIDTH ? { color: stored.color, width } : undefined;
  },
  arrowheads: (raw) => (isRecord(raw) && (raw.ends === "end" || raw.ends === "both") ? { ends: raw.ends } : undefined),
  fill: (raw) => {
    const stored = readColor(raw);
    if (!stored) return;
    const { mode, opacity } = stored;
    if (mode !== "none" && mode !== "solid" && mode !== "semi") return;
    return typeof opacity === "number" && opacity >= 0 && opacity <= 1 ? { mode, color: stored.color, opacity } : undefined;
  },
  font: (raw) => {
    const stored = readColor(raw);
    if (!stored) return;
    const { size, bold, italic } = stored;
    if (typeof bold !== "boolean" || typeof italic !== "boolean" || typeof size !== "number") return;
    const whole = Math.round(size);
    return whole >= MIN_FONT_SIZE && whole <= MAX_FONT_SIZE ? { size: whole, bold, italic, color: stored.color } : undefined;
  },
  textOutline: (raw) => {
    const stored = readColor(raw);
    if (!stored) return;
    const { enabled, width } = stored;
    if (typeof enabled !== "boolean" || typeof width !== "number") return;
    const whole = Math.round(width);
    return whole >= MIN_OUTLINE_WIDTH && whole <= MAX_OUTLINE_WIDTH ? { enabled, color: stored.color, width: whole } : undefined;
  },
};

/** A stored tool style read back safely: valid groups are kept, anything malformed or unknown is dropped. */
export function sanitizeStyle(raw: unknown): Style {
  if (!isRecord(raw)) return {};
  const style: Record<string, unknown> = {};
  for (const [group, read] of Object.entries(GROUP_READERS)) {
    const value = (read as (r: unknown) => unknown)(raw[group]);
    if (value !== undefined) style[group] = value;
  }
  return style as Style;
}
