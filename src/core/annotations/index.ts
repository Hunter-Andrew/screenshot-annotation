// Every drawing tool's model side, in tool-column order. A new tool adds one line here.
import type { Annotation, AnnotationType } from "../annotation";
import { arrowKind } from "./arrow";
import { ellipseKind } from "./ellipse";
import { lineKind } from "./line";
import { rectKind } from "./rect";
import type { AnnotationKind } from "./kind";

export const ANNOTATION_KINDS: readonly AnnotationKind<any>[] = [
  arrowKind,
  lineKind,
  rectKind,
  ellipseKind,
  // textKind, (ticket 11)
  // penKind, (ticket 12)
];

export function kindOf(type: AnnotationType | string): AnnotationKind<Annotation> | undefined {
  return ANNOTATION_KINDS.find((k) => k.type === type);
}

export type { AnnotationKind, Point } from "./kind";
