// The Blur Annotation: a box that pixelates everything beneath it in the stacking order, as it
// looks composited (the Capture and every Annotation below it). Non-destructive (ADR 0002): the
// Capture keeps its pixels; only the editor view and the Export are pixelated. Pixelate only, by
// design: a soft blur can sometimes be partly reversed.
import type { PropertyGroups, Style } from "../propertyGroups";
import { dragBox } from "./box";
import type { AnnotationKind } from "./kind";

export interface BlurAnnotation extends Pick<PropertyGroups, "strength"> {
  id: string;
  type: "blur";
  /** The box, in Capture pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export const blurKind: AnnotationKind<BlurAnnotation> = {
  type: "blur",
  label: "Blur",
  shortcutAction: "tool.blur",
  groups: ["strength"],
  defaultStyle: { strength: { blockSize: 12 } },
  fromDrag(id, from, to, style: Style) {
    const box = dragBox(from, to);
    return box && { id, type: "blur", ...box, strength: style.strength ?? blurKind.defaultStyle.strength! };
  },
};
