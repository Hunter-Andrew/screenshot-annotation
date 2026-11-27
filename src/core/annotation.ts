// The app-owned Annotation model (ADR 0005). Never Konva's or Fabric's serialization.
//
// One object per Annotation: `{ id, type, ...geometry, ...property groups }`, all in Capture
// pixels. The canvas library only renders and edits this model (src/canvas/*).
//
// To add a tool (tickets 10-12, 18-20): add its type below, add it to the `Annotation` union,
// describe it in `src/core/annotations/<type>.ts` and list that in `annotations/index.ts`.
import type { ArrowAnnotation } from "./annotations/arrow";
import type { BlurAnnotation } from "./annotations/blur";
import type { CalloutAnnotation } from "./annotations/callout";
import type { EllipseAnnotation } from "./annotations/ellipse";
import type { HighlightAnnotation } from "./annotations/highlight";
import type { ImageAnnotation } from "./annotations/image";
import type { LineAnnotation } from "./annotations/line";
import type { PenAnnotation } from "./annotations/pen";
import type { RectAnnotation } from "./annotations/rect";
import type { TextAnnotation } from "./annotations/text";
import type { TextBoxAnnotation } from "./annotations/textBoxTool";

/** The format version of a file with no pasted image. A file numbered above what the reader supports opens read-only.
 *  Adding a tool or property group is additive and needs no bump (the app only ever moves forward), except the `image` type: see below and ADR 0004. */
export const FORMAT_VERSION = 1;
/** A file that holds an image Annotation is version 2: it adds an embedded part (the `snIM` chunks) that a
 *  version 1 reader cannot skip, so that reader opens it read-only. Written only when needed (ticket 38). */
export const IMAGE_FORMAT_VERSION = 2;
/** The newest format this build reads and writes. */
export const SUPPORTED_FORMAT_VERSION = IMAGE_FORMAT_VERSION;

export type { ArrowAnnotation, EllipseAnnotation, LineAnnotation, RectAnnotation };
export type { BlurAnnotation, CalloutAnnotation, HighlightAnnotation, PenAnnotation };
export type { ImageAnnotation, TextAnnotation, TextBoxAnnotation };

export type Annotation =
  | ArrowAnnotation
  | LineAnnotation
  | RectAnnotation
  | EllipseAnnotation
  | PenAnnotation
  | HighlightAnnotation
  | BlurAnnotation
  | CalloutAnnotation
  | ImageAnnotation
  | TextAnnotation
  | TextBoxAnnotation;

export type AnnotationType = Annotation["type"];

/** What fills the part of the visible area outside the Capture (ticket 37). Dark is the colour of the "Dark image background" setting, applied when drawing (never stored with the image). */
export type Background = "white" | "dark" | "transparent";

/**
 * The visible area of the Annotated Image, in Capture pixels. Not an Annotation. It may be smaller than
 * the Capture (Crop) or reach past its edges (canvas expansion, ticket 37).
 */
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
  /**
   * Fills the visible area outside the Capture. Absent until the area first reaches past the Capture, when
   * the Settings default is stored here (additive: no format bump; an older app shows the Capture only).
   */
  background?: Background;
  /**
   * Whether the editor shows what lies outside the visible area (cropped-out parts, off-canvas Annotations),
   * dimmed. Absent means true (every file from before this field looks as it did); a new image gets the
   * Settings default stored at creation. Editor-only: never part of an Export.
   */
  showOutside?: boolean;
  /**
   * Auto-grown area (M4 polish B): the base area the growth started from (the Capture, or the Crop the user set
   * explicitly) and the Annotations that reach outside it, each with what it covers. The visible area (`crop`) is
   * the base plus these extents, so it follows them back in. Both are absent when nothing grew it, and cleared
   * when the user sets the area explicitly. An older file has neither: its area never shrinks by itself.
   */
  areaBase?: Crop;
  grownBy?: GrowCause[];
}

/** An Annotation that holds the visible area open past its base: its id and what it covers, in whole Capture pixels. */
export interface GrowCause {
  id: string;
  bounds: Crop;
}

export function emptyModel(): AnnotationModel {
  return { formatVersion: FORMAT_VERSION, annotations: [], crop: null };
}

/** A fresh Annotation id; unique within an image (and in practice across them). */
export function newAnnotationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
