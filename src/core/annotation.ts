// The app-owned Annotation model (ADR 0005). Never Konva's or Fabric's serialization.
//
// One object per Annotation: `{ id, type, ...geometry, ...property groups }`, all in Capture
// pixels. The canvas library only renders and edits this model (src/canvas/*).
//
// To add a tool (tickets 10-12, 18-20): add its type below, add it to the `Annotation` union,
// describe it in `src/core/annotations/<type>.ts` and list that in `annotations/index.ts`.
import type { ArrowAnnotation } from "./annotations/arrow";
import type { CalloutAnnotation } from "./annotations/callout";
import type { EllipseAnnotation } from "./annotations/ellipse";
import type { HighlightAnnotation } from "./annotations/highlight";
import type { LineAnnotation } from "./annotations/line";
import type { PenAnnotation } from "./annotations/pen";
import type { RectAnnotation } from "./annotations/rect";
import type { TextAnnotation } from "./annotations/text";

/** Bump when the embedded format changes incompatibly. A file with a higher number opens read-only.
 *  Adding a tool or property group is additive and needs no bump: the app only ever moves forward. */
export const FORMAT_VERSION = 1;

export type { ArrowAnnotation, EllipseAnnotation, LineAnnotation, RectAnnotation };
export type { CalloutAnnotation, HighlightAnnotation, PenAnnotation };
export type { TextAnnotation };

export type Annotation =
  | ArrowAnnotation
  | LineAnnotation
  | RectAnnotation
  | EllipseAnnotation
  | PenAnnotation
  | HighlightAnnotation
  | CalloutAnnotation
  | TextAnnotation;
  // | BlurAnnotation (20)

export type AnnotationType = Annotation["type"];

/** The visible area of the Annotated Image, in Capture pixels. Not an Annotation. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationModel {
  formatVersion: number;
  /** Back to front. */
  annotations: Annotation[];
  crop: Crop | null;
}

export function emptyModel(): AnnotationModel {
  return { formatVersion: FORMAT_VERSION, annotations: [], crop: null };
}

/** A fresh Annotation id; unique within an image (and in practice across them). */
export function newAnnotationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
