// @vitest-environment node
// Styled text in the model: how `runs` behaves through edits, undo, the history file and a saved image.
import { describe, expect, it } from "vitest";
import type { CalloutAnnotation, TextAnnotation } from "./annotation";
import { createFromCapture, decodeLibraryPng, encodeLibraryPng } from "./annotatedImage";
import { applyEdit, createEditSession } from "./editSession";
import { COALESCE_MS, emptyHistory, invert, popUndo, record } from "./history";
import { parseHistory, serializeHistory } from "./historyFile";
import { encodeRgbaPng } from "./png";

const image = () => createFromCapture(encodeRgbaPng(1, 1, new Uint8Array([1, 2, 3, 255])));
const text = (extra: Partial<TextAnnotation> = {}): TextAnnotation => ({
  id: "t",
  type: "text",
  x: 0,
  y: 0,
  width: 100,
  text: "Hello world",
  font: { size: 24, bold: false, italic: false, color: "#e02424" },
  textOutline: { enabled: true, color: "#ffffff", width: 2 },
  ...extra,
});
const withText = (t = text()) => applyEdit(image(), { kind: "add", annotation: t });

describe("runs in an edit", () => {
  it("an update can put runs on a box, clipped to its text", () => {
    const edited = applyEdit(withText(), { kind: "update", id: "t", patch: { runs: [{ from: 6, to: 99, font: { bold: true } }] } });
    expect((edited.model.annotations[0] as TextAnnotation).runs).toEqual([{ from: 6, to: 11, font: { bold: true } }]);
  });

  it("an update with no styled range leaves no `runs` key at all", () => {
    const styled = withText(text({ runs: [{ from: 0, to: 2, font: { bold: true } }] }));
    const plain = applyEdit(styled, { kind: "update", id: "t", patch: { runs: [] } });
    expect("runs" in plain.model.annotations[0]!).toBe(false);
  });

  it("an Annotation added with an empty list is stored without it", () => {
    expect("runs" in withText(text({ runs: [] })).model.annotations[0]!).toBe(false);
  });

  it("an update that changes the text clips the runs to the new text", () => {
    const styled = withText(text({ runs: [{ from: 6, to: 11, font: { bold: true } }] }));
    const shorter = applyEdit(styled, { kind: "update", id: "t", patch: { text: "Hello wo", runs: [{ from: 6, to: 11, font: { bold: true } }] } });
    expect((shorter.model.annotations[0] as TextAnnotation).runs).toEqual([{ from: 6, to: 8, font: { bold: true } }]);
  });

  it("a Callout takes runs the same way", () => {
    const callout: CalloutAnnotation = {
      ...text(),
      type: "callout",
      stroke: { color: "#e02424", width: 3 },
      fill: { mode: "none", color: "#ffffff", opacity: 1 },
      tail: { enabled: true },
    };
    const edited = applyEdit(applyEdit(image(), { kind: "add", annotation: callout }), {
      kind: "update",
      id: "t",
      patch: { runs: [{ from: 0, to: 5, font: { color: "#00ff00" } }] },
    });
    expect((edited.model.annotations[0] as CalloutAnnotation).runs).toEqual([{ from: 0, to: 5, font: { color: "#00ff00" } }]);
  });
});

describe("undo of a styling change", () => {
  it("the inverse of the first styling puts back a box with no runs, even after the history is saved and read", () => {
    const before = withText();
    const edit = { kind: "update" as const, id: "t", patch: { runs: [{ from: 0, to: 5, font: { bold: true } }] } };
    const inverse = invert(before, edit)!;
    const viaFile = JSON.parse(JSON.stringify(inverse)); // what the history file keeps
    const after = applyEdit(before, edit);
    expect(applyEdit(after, viaFile).model).toEqual(before.model);
    expect("runs" in applyEdit(after, viaFile).model.annotations[0]!).toBe(false);
  });

  it("the inverse of removing runs puts them back", () => {
    const before = withText(text({ runs: [{ from: 0, to: 5, font: { bold: true } }] }));
    const edit = { kind: "update" as const, id: "t", patch: { runs: [] } };
    const back = applyEdit(applyEdit(before, edit), invert(before, edit)!);
    expect(back.model).toEqual(before.model);
  });

  it("a restyle of the whole box that also resets runs is one step and undoes in one", () => {
    const session = createEditSession(withText(text({ runs: [{ from: 0, to: 5, font: { bold: true } }] })), { now: () => 1000 });
    session.apply({ kind: "update", id: "t", patch: { font: { size: 24, bold: true, italic: false, color: "#e02424" }, runs: [] } });
    session.undo();
    expect((session.image.model.annotations[0] as TextAnnotation).runs).toEqual([{ from: 0, to: 5, font: { bold: true } }]);
    expect((session.image.model.annotations[0] as TextAnnotation).font.bold).toBe(false);
  });

  it("two quick styling changes of the same box are one undo step (like any burst of updates)", () => {
    const before = withText();
    const one = { kind: "update" as const, id: "t", patch: { runs: [{ from: 0, to: 2, font: { bold: true } }] } };
    const two = { kind: "update" as const, id: "t", patch: { runs: [{ from: 0, to: 4, font: { bold: true } }] } };
    const after1 = applyEdit(before, one);
    let history = record(emptyHistory(), { undo: invert(before, one)!, redo: one, at: 0 });
    history = record(history, { undo: invert(after1, two)!, redo: two, at: COALESCE_MS - 1 });
    expect(history.undo).toHaveLength(1);
    const step = popUndo(history)!.step;
    expect("runs" in applyEdit(applyEdit(after1, two), step.undo).model.annotations[0]!).toBe(false);
  });

  it("the history file keeps a styling step and reads it back", () => {
    const before = withText();
    const edit = { kind: "update" as const, id: "t", patch: { runs: [{ from: 0, to: 5, font: { italic: true } }] } };
    const file = { hash: "h", touchedAt: 0, history: record(emptyHistory(), { undo: invert(before, edit)!, redo: edit, at: 5 }) };
    const read = parseHistory(serializeHistory(file));
    expect(read).not.toBeNull();
    expect(read!.history.undo[0]!.redo).toEqual(edit);
  });
});

describe("runs in a saved image", () => {
  it("are written and read back as they were", async () => {
    const runs = [{ from: 0, to: 5, font: { bold: true, size: 40 } }];
    const saved = await encodeLibraryPng(withText(text({ runs })), async (i) => i.capture);
    expect((decodeLibraryPng(saved).model.annotations[0] as TextAnnotation).runs).toEqual(runs);
  });

  it("a malformed list is dropped on reading: the text still shows, in the box's own style", async () => {
    const broken = withText(text({ runs: [{ from: "x", to: 2, font: { bold: true } }, { from: 0, to: 200, font: { size: -5 } }] as never }));
    // the applyEdit above already cleans an update; write the broken JSON as an older or damaged file would hold it
    const damaged = { ...broken, model: { ...broken.model, annotations: [{ ...text(), runs: "nonsense" }] } };
    const saved = await encodeLibraryPng(damaged as never, async (i) => i.capture);
    const read = decodeLibraryPng(saved).model.annotations[0] as TextAnnotation;
    expect(read.text).toBe("Hello world");
    expect("runs" in read).toBe(false);
  });

  it("an old image whose boxes have no runs reads as before, with nothing added", async () => {
    const saved = await encodeLibraryPng(withText(), async (i) => i.capture);
    expect(decodeLibraryPng(saved).model.annotations[0]).toEqual(text());
  });
});
