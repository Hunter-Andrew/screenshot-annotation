// Every drawing tool's model side, in tool-column order. A new tool adds one line here.
import type { Annotation, AnnotationType } from "../annotation";
import { arrowKind } from "./arrow";
import { blurKind } from "./blur";
import { calloutKind } from "./callout";
import { ellipseKind } from "./ellipse";
import { highlightKind } from "./highlight";
import { lineKind } from "./line";
import { penKind } from "./pen";
import { rectKind } from "./rect";
import { textKind } from "./text";
import type { AnnotationKind } from "./kind";

export const ANNOTATION_KINDS: readonly AnnotationKind<any>[] = [
  arrowKind,
  lineKind,
  rectKind,
  ellipseKind,
  textKind,
  calloutKind,
  penKind,
  highlightKind,
  blurKind,
];

export function kindOf(type: AnnotationType | string): AnnotationKind<Annotation> | undefined {
  return ANNOTATION_KINDS.find((k) => k.type === type);
}

export type { AnnotationKind, Point } from "./kind";
