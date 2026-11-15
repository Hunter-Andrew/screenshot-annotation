// Editing an Annotated Image: every change is an `Edit` applied through one `EditSession`.
// Pure TypeScript. The session is the single choke point for edits, so persistent undo/redo
// (ticket 13) hooks in here: `apply` records each edit's inverse (src/core/history.ts) and
// undo/redo replay those through the same `applyEdit`.
import type { AnnotatedImage } from "./annotatedImage";
import type { Annotation } from "./annotation";
import { emptyHistory, invert, popRedo, popUndo, record, type HistoryState } from "./history";

export type Edit =
  /** `index` (back-to-front position) is how undoing a delete puts the Annotation back where it was; default: on top. */
  | { kind: "add"; annotation: Annotation; index?: number }
  /** `patch` replaces whole top-level keys, so a group (`stroke`...) is replaced, not merged. */
  | { kind: "update"; id: string; patch: Partial<Annotation> }
  | { kind: "delete"; id: string }
  /** Move to back-to-front position `to` (clamped): `to` one higher is "bring forward". */
  | { kind: "reorder"; id: string; to: number };
  // | { kind: "setCrop"; crop } (ticket 21)

/** The image after `edit`. Returns the same image when the edit changes nothing (unknown id). */
export function applyEdit(image: AnnotatedImage, edit: Edit): AnnotatedImage {
  const { model } = image;
  switch (edit.kind) {
    case "add":
      const annotations = model.annotations.slice();
      annotations.splice(edit.index ?? annotations.length, 0, edit.annotation);
      return { ...image, model: { ...model, annotations } };
    case "update": {
      const index = model.annotations.findIndex((a) => a.id === edit.id);
      if (index < 0) return image;
      const current = model.annotations[index]!;
      const updated = { ...current, ...edit.patch, id: current.id, type: current.type } as Annotation;
      const annotations = model.annotations.slice();
      annotations[index] = updated;
      return { ...image, model: { ...model, annotations } };
    }
    case "delete": {
      if (!model.annotations.some((a) => a.id === edit.id)) return image;
      return { ...image, model: { ...model, annotations: model.annotations.filter((a) => a.id !== edit.id) } };
    }
    case "reorder": {
      const from = model.annotations.findIndex((a) => a.id === edit.id);
      const to = Math.max(0, Math.min(edit.to, model.annotations.length - 1));
      if (from < 0 || from === to) return image;
      const annotations = model.annotations.slice();
      const [moved] = annotations.splice(from, 1);
      annotations.splice(to, 0, moved!);
      return { ...image, model: { ...model, annotations } };
    }
    default:
      return image;
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
  /** Take back the last edit. False when there is nothing to undo. */
  undo(): boolean;
  /** Reapply the last undone edit. False when there is nothing to redo. */
  redo(): boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** The undo/redo stacks as they are now (an immutable value: safe to keep and serialize). */
  readonly history: HistoryState;
  /** Called after each edit that changed something. Returns the unsubscribe function. */
  subscribe(listener: (change: EditChange) => void): () => void;
}

export interface SessionOptions {
  /** Steps restored from an earlier run of the app. */
  history?: HistoryState;
  /** Milliseconds since the epoch; injectable so tests control step times. */
  now?: () => number;
}

export function createEditSession(initial: AnnotatedImage, options: SessionOptions = {}): EditSession {
  let image = initial;
  let history = options.history ?? emptyHistory();
  const now = options.now ?? Date.now;
  const listeners = new Set<(change: EditChange) => void>();
  const notify = (edit: Edit) => listeners.forEach((listener) => listener({ image, edit }));

  /** Replay steps from `pop` until one changes the image (a stale step is dropped, not a dead end). */
  const replay = (pop: typeof popUndo, which: "undo" | "redo"): boolean => {
    for (let next = pop(history); next; next = pop(history)) {
      const edit = next.step[which];
      const changed = applyEdit(image, edit);
      if (changed === image) {
        // Drop the stale step: it is on the other stack in `next.history`, so take it back off.
        history =
          which === "undo"
            ? { undo: next.history.undo, redo: next.history.redo.slice(0, -1) }
            : { undo: next.history.undo.slice(0, -1), redo: next.history.redo };
        continue;
      }
      history = next.history;
      image = changed;
      notify(edit);
      return true;
    }
    return false;
  };

  return {
    get image() {
      return image;
    },
    get history() {
      return history;
    },
    get canUndo() {
      return history.undo.length > 0;
    },
    get canRedo() {
      return history.redo.length > 0;
    },
    apply(edit) {
      const inverse = invert(image, edit);
      const next = applyEdit(image, edit);
      if (next === image) return;
      if (inverse) history = record(history, { undo: inverse, redo: edit, at: now() });
      image = next;
      notify(edit);
    },
    undo: () => replay(popUndo, "undo"),
    redo: () => replay(popRedo, "redo"),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
