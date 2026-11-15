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

export interface PropertyGroups {
  stroke: Stroke;
  arrowheads: Arrowheads;
  // fill: Fill; // ticket 10
  font: Font;
  textOutline: TextOutline;
}

export type GroupId = keyof PropertyGroups;

/** A (possibly partial) set of group values: a tool's default style, or a restyle patch. */
export type Style = Partial<PropertyGroups>;
