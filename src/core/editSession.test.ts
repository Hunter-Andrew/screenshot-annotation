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
