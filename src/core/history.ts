// Undo/redo history of one Annotated Image (ticket 13). Pure TypeScript, no clock of its own.
//
// A step is the `Edit` that was applied plus the `Edit` that takes it back (its inverse). Both are
// plain JSON, so the whole history serializes (src/core/historyFile.ts) and replays through the
// same `applyEdit` as any other edit. The inverse is computed from the image as it was before the
// edit, generically: an update inverts to the old values of the keys it patched, so a new Annotation
// kind (tickets 10-12, 18-20) needs nothing here. A new kind of `Edit` (ticket 21's `setCrop`) adds
// one case to `invert`; `setCrop` inverts to the crop it replaced.
import type { AnnotatedImage } from "./annotatedImage";
import { sameCrop } from "./crop";
import { applyEdit, type Edit, growthOf, sameGrowth } from "./editSession";

/** Most steps kept per image (spec: undo history, 200 steps). */
export const HISTORY_CAP = 200;
/** Updates to the same Annotation closer together than this (ms) are one step: a drag, a slider. */
export const COALESCE_MS = 500;

export interface Step {
  /** Takes the edit back. */
  undo: Edit;
  /** The edit as it was applied. */
  redo: Edit;
  /** When it was applied (ms since the epoch, from the session's clock). */
  at: number;
}

export interface HistoryState {
  /** Oldest first; the last is what Undo takes back. */
  undo: Step[];
  /** The last is what Redo reapplies. */
  redo: Step[];
}

export function emptyHistory(): HistoryState {
  return { undo: [], redo: [] };
}

/**
 * The `Edit` that restores `before` after `edit` was applied to it, or null if `edit` would change
 * nothing there (unknown id, already in that position).
 */
export function invert(before: AnnotatedImage, edit: Edit): Edit | null {
  const list = before.model.annotations;
  switch (edit.kind) {
    case "add":
      return { kind: "delete", id: edit.annotation.id };
    case "update": {
      const current = list.find((a) => a.id === edit.id);
      if (!current) return null;
      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(edit.patch)) {
        const before = (current as unknown as Record<string, unknown>)[key];
        // A box with no styled ranges has no `runs`; the saved history file cannot hold "absent", so it says "no ranges".
        patch[key] = before === undefined && key === "runs" ? [] : before;
      }
      return { kind: "update", id: edit.id, patch };
    }
    case "delete": {
      const index = list.findIndex((a) => a.id === edit.id);
      return index < 0 ? null : { kind: "add", annotation: list[index]!, index };
    }
    case "reorder": {
      const index = list.findIndex((a) => a.id === edit.id);
      const to = Math.max(0, Math.min(edit.to, list.length - 1));
      return index < 0 || index === to ? null : { kind: "reorder", id: edit.id, to: index };
    }
    case "setCrop":
      return sameCrop(before.model.crop, edit.crop) ? null : { kind: "setCrop", crop: before.model.crop };
    case "setBackground":
      return (before.model.background ?? null) === edit.background ? null : { kind: "setBackground", background: before.model.background ?? null };
    case "setShowOutside":
      return (before.model.showOutside ?? null) === edit.showOutside ? null : { kind: "setShowOutside", showOutside: before.model.showOutside ?? null };
    case "setGrowth": {
      const growth = growthOf(before.model);
      return sameGrowth(growth, edit.growth) ? null : { kind: "setGrowth", growth };
    }
    case "batch": {
      // Each part is inverted against the image as the parts before it left it; undo runs them in reverse.
      const inverses: Edit[] = [];
      let image = before;
      for (const part of edit.edits) {
        const inverse = invert(image, part);
        if (inverse) inverses.unshift(inverse);
        image = applyEdit(image, part);
      }
      return inverses.length > 0 ? { kind: "batch", edits: inverses } : null;
    }
    default:
      return null;
  }
}

/** The pasted images (ticket 38) the steps would put back (an Annotation they add), each id once. */
export function historyImageIds(history: HistoryState): string[] {
  const ids = new Set<string>();
  for (const step of [...history.undo, ...history.redo]) {
    for (const edit of [step.undo, step.redo]) {
      for (const part of edit.kind === "batch" ? edit.edits : [edit]) {
        if (part.kind === "add" && part.annotation.type === "image") ids.add(part.annotation.imageId);
      }
    }
  }
  return [...ids];
}

const sameKeys =(a: object, b: object) => {
  const [x, y] = [Object.keys(a).sort(), Object.keys(b).sort()];
  return x.length === y.length && x.every((key, i) => key === y[i]);
};

/** A new step on top of the undo stack: clears Redo, merges a burst of updates, enforces the cap. */
export function record(history: HistoryState, step: Step): HistoryState {
  const top = history.undo.at(-1);
  let undo: Step[];
  if (
    top &&
    top.redo.kind === "update" &&
    step.redo.kind === "update" &&
    top.undo.kind === "update" &&
    top.redo.id === step.redo.id &&
    sameKeys(top.redo.patch, step.redo.patch) &&
    step.at - top.at <= COALESCE_MS
  ) {
    // Keep the oldest "before" and the newest "after".
    undo = [...history.undo.slice(0, -1), { undo: top.undo, redo: step.redo, at: step.at }];
  } else {
    undo = [...history.undo, step];
  }
  return { undo: undo.slice(-HISTORY_CAP), redo: [] };
}

/** Take the newest step off the undo stack onto the redo stack. Null when there is nothing to undo. */
export function popUndo(history: HistoryState): { history: HistoryState; step: Step } | null {
  const step = history.undo.at(-1);
  if (!step) return null;
  return { step, history: { undo: history.undo.slice(0, -1), redo: [...history.redo, step] } };
}

/** Take the newest step off the redo stack back onto the undo stack. Null when there is nothing to redo. */
export function popRedo(history: HistoryState): { history: HistoryState; step: Step } | null {
  const step = history.redo.at(-1);
  if (!step) return null;
  return { step, history: { undo: [...history.undo, step], redo: history.redo.slice(0, -1) } };
}
