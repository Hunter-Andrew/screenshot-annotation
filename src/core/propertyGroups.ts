// The shared property groups of the Annotation model (ADR 0005). Each tool opts into the groups it
// uses (`AnnotationKind.groups`); an Annotation stores each group it uses under the group's key.
//
// To add a group (tickets 10 and 11): declare its value type here, add it to `PropertyGroups`, and
// register its Style panel editor in `src/editor/style/groups.tsx`.

export interface Stroke {
  /** CSS hex color, e.g. "#e02424". Strokes are always solid. */
  color: string;
  /** 1-30 px, in Capture pixels. */
  width: number;
}

export interface Arrowheads {
  /** "end": one head at the end point (the default). "both": a head at each end. */
  ends: "end" | "both";
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
  // font: Font; // ticket 11
  // textOutline: TextOutline; // ticket 11
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

const HEX = /^#[0-9a-fA-F]{6}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One reader per group: the valid value, or undefined to drop it. A new group adds one entry. */
const GROUP_READERS: { [K in GroupId]: (raw: unknown) => PropertyGroups[K] | undefined } = {
  stroke: (raw) => {
    if (!isRecord(raw) || typeof raw.color !== "string" || !HEX.test(raw.color) || typeof raw.width !== "number") return;
    const width = Math.round(raw.width);
    return width >= 1 && width <= 30 ? { color: raw.color, width } : undefined;
  },
  arrowheads: (raw) => (isRecord(raw) && (raw.ends === "end" || raw.ends === "both") ? { ends: raw.ends } : undefined),
  fill: (raw) => {
    if (!isRecord(raw) || typeof raw.color !== "string" || !HEX.test(raw.color)) return;
    const { mode, opacity } = raw;
    if (mode !== "none" && mode !== "solid" && mode !== "semi") return;
    return typeof opacity === "number" && opacity >= 0 && opacity <= 1 ? { mode, color: raw.color, opacity } : undefined;
  },
  // font, textOutline (ticket 11)
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
