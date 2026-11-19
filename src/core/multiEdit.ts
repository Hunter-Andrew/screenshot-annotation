// Several Annotations changed at once (a multi-selection moved or deleted): one edit, so one Undo step, with the
// visible area following each of them in turn (an area they grew shrinks back when they go).
import type { Background, Crop } from "./annotation";
import type { AnnotatedImage } from "./annotatedImage";
import { followAreaEdit } from "./area";
import { applyEdit, type Edit } from "./editSession";

export interface FollowedEdit {
  edit: Edit;
  /** What the Annotation covers after the edit, in Capture pixels; none for a delete. */
  bounds?: Crop;
}

/** The one edit that applies `items` in order, each followed by the area change it causes; null for no items. */
export function followAreaEdits(
  image: AnnotatedImage,
  items: readonly FollowedEdit[],
  defaultBackground: Background,
): { edit: Edit | null; limited: boolean } {
  const parts: Edit[] = [];
  let limited = false;
  let working = image;
  for (const { edit, bounds } of items) {
    const followed = followAreaEdit(working, edit, bounds, defaultBackground);
    limited ||= followed.limited;
    parts.push(...(followed.edit.kind === "batch" ? followed.edit.edits : [followed.edit]));
    working = applyEdit(working, followed.edit);
  }
  return { edit: parts.length === 0 ? null : { kind: "batch", edits: parts }, limited };
}
