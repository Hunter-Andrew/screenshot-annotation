// Editing an Annotated Image: every change is an `Edit` applied through one `EditSession`.
// Pure TypeScript. The session is the single choke point for edits, so persistent undo/redo
// (ticket 13) hooks in here: record each applied edit's inverse in `apply`, and replay inverses
// through the same `applyEdit`.
import type { AnnotatedImage } from "./annotatedImage";
import type { Annotation } from "./annotation";

export type Edit =
  | { kind: "add"; annotation: Annotation }
  /** `patch` replaces whole top-level keys, so a group (`stroke`...) is replaced, not merged. */
  | { kind: "update"; id: string; patch: Partial<Annotation> };
  // | { kind: "delete"; id } | { kind: "reorder"; ... } (ticket 13)
  // | { kind: "setCrop"; crop } (ticket 21)

/** The image after `edit`. Returns the same image when the edit changes nothing (unknown id). */
export function applyEdit(image: AnnotatedImage, edit: Edit): AnnotatedImage {
  const { model } = image;
  switch (edit.kind) {
    case "add":
      return { ...image, model: { ...model, annotations: [...model.annotations, edit.annotation] } };
    case "update": {
      const index = model.annotations.findIndex((a) => a.id === edit.id);
      if (index < 0) return image;
      const current = model.annotations[index]!;
      const updated = { ...current, ...edit.patch, id: current.id, type: current.type } as Annotation;
      const annotations = model.annotations.slice();
      annotations[index] = updated;
      return { ...image, model: { ...model, annotations } };
    }
  }
}

export interface EditChange {
  image: AnnotatedImage;
  edit: Edit;
}

export interface EditSession {
  /** The image as it is now. */
  readonly image: AnnotatedImage;
  apply(edit: Edit): void;
  /** Called after each edit that changed something. Returns the unsubscribe function. */
  subscribe(listener: (change: EditChange) => void): () => void;
}

export function createEditSession(initial: AnnotatedImage): EditSession {
  let image = initial;
  const listeners = new Set<(change: EditChange) => void>();
  return {
    get image() {
      return image;
    },
    apply(edit) {
      const next = applyEdit(image, edit);
      if (next === image) return;
      image = next;
      listeners.forEach((listener) => listener({ image, edit }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
