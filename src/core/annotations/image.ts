// The image Annotation (ticket 38): a picture pasted from the clipboard. It is never drawn with a
// tool, so it has no tool-column button and no shortcut; it is a normal Annotation otherwise (move,
// resize, restyle, stack, delete). Its pixels live in the file as their own `snIM` chunk, referenced
// by `imageId` (the SHA-256 of the PNG bytes), so the model JSON stays small and the same picture
// pasted twice is stored once.
import type { PropertyGroups } from "../propertyGroups";
import type { AnnotationKind } from "./kind";

export interface ImageAnnotation extends Pick<PropertyGroups, "border" | "opacity"> {
  id: string;
  type: "image";
  /** The box, in Capture pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Key of the picture's bytes in the Annotated Image's `images`. */
  imageId: string;
}

/** Every pasted image starts like this: no border, fully opaque. Never stored per tool (no sticky styles). */
export const DEFAULT_IMAGE_STYLE: Pick<PropertyGroups, "border" | "opacity"> = {
  border: { enabled: false, color: "#e02424", width: 4 },
  opacity: { value: 1 },
};

export const imageKind: AnnotationKind<ImageAnnotation> = {
  type: "image",
  label: "Image",
  shortcutAction: "",
  groups: ["border", "opacity"],
  defaultStyle: DEFAULT_IMAGE_STYLE,
  pasted: true,
  // Pasted, not drawn.
  fromDrag: () => null,
};
