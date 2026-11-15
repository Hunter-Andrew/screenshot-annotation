// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type ArrowAnnotation } from "./annotation";
import { createFromCapture } from "./annotatedImage";
import { applyEdit, createEditSession } from "./editSession";
import { encodeRgbaPng } from "./png";

const capture = () => encodeRgbaPng(1, 1, new Uint8Array([1, 2, 3, 255]));
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

describe("applyEdit", () => {
  it("adds an Annotation on top, leaving the original image untouched", () => {
    const image = createFromCapture(capture());

    const edited = applyEdit(image, { kind: "add", annotation: arrow("a") });
    const again = applyEdit(edited, { kind: "add", annotation: arrow("b") });

    expect(image.model.annotations).toEqual([]);
    expect(again.model.annotations.map((a) => a.id)).toEqual(["a", "b"]);
    expect(again.capture).toBe(image.capture);
  });

  it("updates only the named Annotation, sharing the others", () => {
    const image = applyEdit(
      applyEdit(createFromCapture(capture()), { kind: "add", annotation: arrow("a") }),
      { kind: "add", annotation: arrow("b") },
    );

    const edited = applyEdit(image, {
      kind: "update",
      id: "a",
      patch: { x2: 99, arrowheads: { ends: "both" } },
    });

    expect(edited.model.annotations[0]).toMatchObject({ id: "a", x2: 99, arrowheads: { ends: "both" } });
    expect(edited.model.annotations[1]).toBe(image.model.annotations[1]);
  });

  it("never lets an update change the id or the type", () => {
    const image = applyEdit(createFromCapture(capture()), { kind: "add", annotation: arrow("a") });

    const edited = applyEdit(image, { kind: "update", id: "a", patch: { id: "z", type: "arrow", x2: 1 } });

    expect(edited.model.annotations[0]).toMatchObject({ id: "a", type: "arrow", x2: 1 });
  });

  it("ignores an update for an Annotation that is not there", () => {
    const image = createFromCapture(capture());

    expect(applyEdit(image, { kind: "update", id: "missing", patch: { x2: 1 } })).toBe(image);
  });
});

describe("EditSession", () => {
  it("applies edits in order and tells every subscriber the new image and the edit", () => {
    const session = createEditSession(createFromCapture(capture()));
    const seen: string[][] = [];
    session.subscribe(({ image, edit }) => seen.push([edit.kind, ...image.model.annotations.map((a) => a.id)]));

    session.apply({ kind: "add", annotation: arrow("a") });
    session.apply({ kind: "update", id: "a", patch: { x2: 7 } });

    expect(seen).toEqual([
      ["add", "a"],
      ["update", "a"],
    ]);
    expect(session.image.model.annotations[0]).toMatchObject({ x2: 7 });
  });

  it("stays quiet when an edit changes nothing, and stops after unsubscribe", () => {
    const session = createEditSession(createFromCapture(capture()));
    let calls = 0;
    const off = session.subscribe(() => calls++);

    session.apply({ kind: "update", id: "nope", patch: { x2: 1 } });
    off();
    session.apply({ kind: "add", annotation: arrow("a") });

    expect(calls).toBe(0);
  });
});

describe("EditSession undo and redo", () => {
  /** A clock the test moves by hand, so each edit is a step of its own unless a test says otherwise. */
  const clock = () => {
    let t = 0;
    return { now: () => (t += 10_000) };
  };
  const make = () => createEditSession(createFromCapture(capture()), clock());
  const ids = (s: { image: { model: { annotations: { id: string }[] } } }) => s.image.model.annotations.map((a) => a.id);

  it("undoes and redoes every kind of edit, and tells subscribers so the canvas redraws", () => {
    const session = make();
    const seen: string[] = [];
    session.apply({ kind: "add", annotation: arrow("a") });
    session.apply({ kind: "add", annotation: arrow("b") });
    session.apply({ kind: "update", id: "a", patch: { x2: 7 } });
    session.apply({ kind: "reorder", id: "a", to: 1 });
    session.apply({ kind: "delete", id: "b" });
    const final = session.image.model;
    session.subscribe(({ edit }) => seen.push(edit.kind));

    while (session.undo());
    expect(session.image.model.annotations).toEqual([]);
    expect(session.canUndo).toBe(false);
    while (session.redo());
    expect(session.image.model).toEqual(final);
    expect(session.canRedo).toBe(false);
    expect(seen).toHaveLength(10);
  });

  it("undoing a delete puts the Annotation back in its old place in the stack", () => {
    const session = make();
    for (const id of ["a", "b", "c"]) session.apply({ kind: "add", annotation: arrow(id) });
    session.apply({ kind: "delete", id: "b" });
    expect(ids(session)).toEqual(["a", "c"]);

    session.undo();

    expect(ids(session)).toEqual(["a", "b", "c"]);
  });

  it("a new edit after an undo ends the redo branch", () => {
    const session = make();
    session.apply({ kind: "add", annotation: arrow("a") });
    session.undo();
    expect(session.canRedo).toBe(true);

    session.apply({ kind: "add", annotation: arrow("b") });

    expect(session.canRedo).toBe(false);
    expect(session.redo()).toBe(false);
  });

  it("an edit that changes nothing is not a step", () => {
    const session = make();
    session.apply({ kind: "delete", id: "nope" });
    expect(session.canUndo).toBe(false);
  });

  it("a restored history carries on: its steps undo as if made in this run", () => {
    const first = make();
    first.apply({ kind: "add", annotation: arrow("a") });
    first.apply({ kind: "add", annotation: arrow("b") });
    const saved = JSON.parse(JSON.stringify(first.history));

    const second = createEditSession(first.image, { history: saved });
    second.undo();

    expect(ids(second)).toEqual(["a"]);
    expect(second.canRedo).toBe(true);
  });

  it("skips a stale step instead of getting stuck on it", () => {
    const session = createEditSession(createFromCapture(capture()), {
      history: {
        undo: [{ undo: { kind: "delete", id: "ghost" }, redo: { kind: "update", id: "ghost", patch: {} }, at: 0 }],
        redo: [],
      },
    });
    expect(session.undo()).toBe(false);
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
  });

  it("keeps at most 200 steps through the session", () => {
    const session = make();
    for (let n = 0; n < 230; n++) session.apply({ kind: "add", annotation: arrow(`a${n}`) });
    let undone = 0;
    while (session.undo()) undone++;
    expect(undone).toBe(200);
    expect(session.image.model.annotations).toHaveLength(30);
  });
});
