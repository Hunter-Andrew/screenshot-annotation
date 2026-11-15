// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ArrowAnnotation } from "./annotation";
import { createFromCapture } from "./annotatedImage";
import { applyEdit, type Edit } from "./editSession";
import { COALESCE_MS, HISTORY_CAP, emptyHistory, invert, popRedo, popUndo, record, type HistoryState } from "./history";
import { encodeRgbaPng } from "./png";

const base = () => createFromCapture(encodeRgbaPng(1, 1, new Uint8Array([1, 2, 3, 255])));
const arrow = (id: string, x2 = 50): ArrowAnnotation => ({
  id,
  type: "arrow",
  x1: 0,
  y1: 0,
  x2,
  y2: 10,
  stroke: { color: "#e02424", width: 4 },
  arrowheads: { ends: "end" },
});
const ids = (image: ReturnType<typeof base>) => image.model.annotations.map((a) => a.id);
const abc = [arrow("a"), arrow("b"), arrow("c")].reduce(
  (image, annotation) => applyEdit(image, { kind: "add", annotation }),
  base(),
);

describe("invert: the Edit that takes an edit back", () => {
  const roundTrip = (edit: Edit) => {
    const inverse = invert(abc, edit)!;
    expect(inverse).not.toBeNull();
    const back = applyEdit(applyEdit(abc, edit), inverse);
    expect(back.model).toEqual(abc.model);
  };

  it("add, update, delete and reorder each have an inverse that restores the model exactly", () => {
    roundTrip({ kind: "add", annotation: arrow("d") });
    roundTrip({ kind: "update", id: "b", patch: { x2: 7, stroke: { color: "#000000", width: 9 } } });
    roundTrip({ kind: "delete", id: "a" });
    roundTrip({ kind: "delete", id: "b" });
    roundTrip({ kind: "reorder", id: "a", to: 2 });
    roundTrip({ kind: "reorder", id: "c", to: 0 });
  });

  it("works for any Annotation kind without knowing it: an update inverts to the old values of the same keys", () => {
    expect(invert(abc, { kind: "update", id: "a", patch: { x2: 1 } })).toEqual({
      kind: "update",
      id: "a",
      patch: { x2: 50 },
    });
  });

  it("has no inverse for an edit that changes nothing", () => {
    expect(invert(abc, { kind: "delete", id: "zzz" })).toBeNull();
    expect(invert(abc, { kind: "update", id: "zzz", patch: { x2: 1 } })).toBeNull();
    expect(invert(abc, { kind: "reorder", id: "a", to: 0 })).toBeNull();
  });
});

describe("applyEdit: delete, reorder and add at an index", () => {
  it("delete removes only that Annotation", () => {
    expect(ids(applyEdit(abc, { kind: "delete", id: "b" }))).toEqual(["a", "c"]);
    expect(applyEdit(abc, { kind: "delete", id: "nope" })).toBe(abc);
  });

  it("reorder moves one Annotation to a back-to-front index, clamped", () => {
    expect(ids(applyEdit(abc, { kind: "reorder", id: "a", to: 1 }))).toEqual(["b", "a", "c"]);
    expect(ids(applyEdit(abc, { kind: "reorder", id: "c", to: 0 }))).toEqual(["c", "a", "b"]);
    expect(ids(applyEdit(abc, { kind: "reorder", id: "a", to: 99 }))).toEqual(["b", "c", "a"]);
    expect(applyEdit(abc, { kind: "reorder", id: "c", to: 2 })).toBe(abc);
  });

  it("add can insert at an index (what undoing a delete does)", () => {
    expect(ids(applyEdit(abc, { kind: "add", annotation: arrow("z"), index: 1 }))).toEqual(["a", "z", "b", "c"]);
  });
});

describe("history stacks", () => {
  const step = (n: number, at = n * 10_000) => ({
    undo: { kind: "delete", id: `a${n}` } as Edit,
    redo: { kind: "add", annotation: arrow(`a${n}`) } as Edit,
    at,
  });

  it("keeps at most 200 steps, dropping the oldest", () => {
    expect(HISTORY_CAP).toBe(200);
    let history: HistoryState = emptyHistory();
    for (let n = 0; n < 250; n++) history = record(history, step(n));
    expect(history.undo).toHaveLength(200);
    expect(history.undo[0]!.redo).toMatchObject({ annotation: { id: "a50" } });
    expect(history.undo.at(-1)!.redo).toMatchObject({ annotation: { id: "a249" } });
  });

  it("a new edit clears the redo stack", () => {
    let history = record(record(emptyHistory(), step(1)), step(2));
    history = popUndo(history)!.history;
    expect(history.redo).toHaveLength(1);
    history = record(history, step(3));
    expect(history.redo).toEqual([]);
  });

  it("undo then redo returns the same step, and an empty stack gives null", () => {
    expect(popUndo(emptyHistory())).toBeNull();
    expect(popRedo(emptyHistory())).toBeNull();
    const history = record(emptyHistory(), step(1));
    const undone = popUndo(history)!;
    expect(undone.step).toEqual(step(1));
    expect(undone.history.undo).toEqual([]);
    const redone = popRedo(undone.history)!;
    expect(redone.step).toEqual(step(1));
    expect(redone.history).toEqual(history);
  });

  describe("a burst of updates to the same Annotation is one step", () => {
    const update = (id: string, value: number, old: number, at: number) => ({
      undo: { kind: "update", id, patch: { x2: old } } as Edit,
      redo: { kind: "update", id, patch: { x2: value } } as Edit,
      at,
    });

    it("merges within the window, keeping the oldest 'before' and the newest 'after'", () => {
      let history = record(emptyHistory(), update("a", 1, 0, 1000));
      history = record(history, update("a", 2, 1, 1000 + COALESCE_MS - 1));
      expect(history.undo).toHaveLength(1);
      expect(history.undo[0]!.undo).toEqual({ kind: "update", id: "a", patch: { x2: 0 } });
      expect(history.undo[0]!.redo).toEqual({ kind: "update", id: "a", patch: { x2: 2 } });
    });

    it("does not merge after the window, for another Annotation, or for other keys", () => {
      let history = record(emptyHistory(), update("a", 1, 0, 1000));
      history = record(history, update("a", 2, 1, 1000 + COALESCE_MS + 1));
      history = record(history, update("b", 2, 1, 1000 + COALESCE_MS + 2));
      history = record(history, {
        undo: { kind: "update", id: "b", patch: { y2: 1 } },
        redo: { kind: "update", id: "b", patch: { y2: 5 } },
        at: 1000 + COALESCE_MS + 3,
      });
      expect(history.undo).toHaveLength(4);
    });
  });
});
