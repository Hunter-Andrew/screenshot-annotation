// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFromCapture } from "./annotatedImage";
import type { ArrowAnnotation } from "./annotation";
import { cropFromDrag, MIN_CROP } from "./crop";
import { createEditSession } from "./editSession";
import { parseHistory, serializeHistory } from "./historyFile";
import { encodeRgbaPng } from "./png";

const capture = () => encodeRgbaPng(1, 1, new Uint8Array([1, 2, 3, 255]));
const arrow = (id: string): ArrowAnnotation => ({
  id,
  type: "arrow",
  x1: 0,
  y1: 0,
  x2: 50,
  y2: 10,
  stroke: { color: "#e02424", width: 4 },
  arrowheads: { ends: "end" },
});
const rect = { x: 10, y: 20, width: 30, height: 40 };
const make = () => createEditSession(createFromCapture(capture()));

describe("setCrop", () => {
  it("sets and clears the visible area without touching the Capture or the Annotations", () => {
    const session = make();
    session.apply({ kind: "add", annotation: arrow("a") });
    const original = session.image.capture;

    session.apply({ kind: "setCrop", crop: rect });
    expect(session.image.model.crop).toEqual(rect);
    session.apply({ kind: "setCrop", crop: null });
    expect(session.image.model.crop).toBeNull();

    expect(session.image.capture).toBe(original);
    expect(session.image.model.annotations.map((a) => a.id)).toEqual(["a"]);
  });

  it("undo and redo walk the crop back and forth; widening again is a step too", () => {
    const session = make();
    session.apply({ kind: "setCrop", crop: rect });
    const wider = { x: 0, y: 0, width: 50, height: 60 };
    session.apply({ kind: "setCrop", crop: wider });

    session.undo();
    expect(session.image.model.crop).toEqual(rect);
    session.undo();
    expect(session.image.model.crop).toBeNull();
    session.redo();
    session.redo();
    expect(session.image.model.crop).toEqual(wider);
  });

  it("setting the crop it already has is not a step", () => {
    const session = make();
    session.apply({ kind: "setCrop", crop: null });
    session.apply({ kind: "setCrop", crop: rect });
    session.apply({ kind: "setCrop", crop: { ...rect } });
    let undone = 0;
    while (session.undo()) undone++;
    expect(undone).toBe(1);
  });

  it("a crop step survives the history file: serialize, parse, undo in a new run", () => {
    const first = make();
    first.apply({ kind: "setCrop", crop: rect });
    const file = parseHistory(serializeHistory({ hash: "h", touchedAt: 1, history: first.history }))!;
    expect(file).not.toBeNull();

    const second = createEditSession(first.image, { history: file.history });
    expect(second.undo()).toBe(true);
    expect(second.image.model.crop).toBeNull();
    expect(second.redo()).toBe(true);
    expect(second.image.model.crop).toEqual(rect);
  });
});

describe("cropFromDrag", () => {
  const size = { width: 100, height: 80 };

  it("is the rectangle between the press and the release, whichever way it was dragged", () => {
    expect(cropFromDrag({ x: 10, y: 20 }, { x: 60, y: 50 }, size)).toEqual({ x: 10, y: 20, width: 50, height: 30 });
    expect(cropFromDrag({ x: 60, y: 50 }, { x: 10, y: 20 }, size)).toEqual({ x: 10, y: 20, width: 50, height: 30 });
  });

  it("stays inside the Capture", () => {
    expect(cropFromDrag({ x: -30, y: -5 }, { x: 140, y: 200 }, size)).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });

  it("is whole pixels", () => {
    expect(cropFromDrag({ x: 10.4, y: 20.6 }, { x: 60.2, y: 50.9 }, size)).toEqual({ x: 10, y: 21, width: 50, height: 30 });
  });

  it("is nothing when it is only a click or a sliver", () => {
    expect(MIN_CROP).toBeGreaterThan(1);
    expect(cropFromDrag({ x: 10, y: 10 }, { x: 10, y: 10 }, size)).toBeNull();
    expect(cropFromDrag({ x: 10, y: 10 }, { x: 10 + MIN_CROP - 1, y: 60 }, size)).toBeNull();
    expect(cropFromDrag({ x: 10, y: 10 }, { x: 60, y: 10 + MIN_CROP - 1 }, size)).toBeNull();
    expect(cropFromDrag({ x: 10, y: 10 }, { x: 10 + MIN_CROP, y: 10 + MIN_CROP }, size)).not.toBeNull();
  });
});
