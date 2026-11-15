// The app-owned Annotation model (ADR 0005). Never Konva's or Fabric's serialization.
// M1 only stores an empty model; later tickets add the per-type geometry and property groups.

/** Bump when the embedded format changes. A file with a higher number opens read-only. */
export const FORMAT_VERSION = 1;

export type AnnotationType =
  | "arrow"
  | "line"
  | "pen"
  | "rect"
  | "ellipse"
  | "text"
  | "callout"
  | "highlight"
  | "blur";

export interface Annotation {
  id: string;
  type: AnnotationType;
  [property: string]: unknown;
}

/** The visible area of the Annotated Image, in Capture pixels. Not an Annotation. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationModel {
  formatVersion: number;
  annotations: Annotation[];
  crop: Crop | null;
}

export function emptyModel(): AnnotationModel {
  return { formatVersion: FORMAT_VERSION, annotations: [], crop: null };
}
