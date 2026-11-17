// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFromCapture, decodeLibraryPng, encodeLibraryPng, exportPng } from "./annotatedImage";
import type { RectAnnotation } from "./annotation";
import { AREA_LIMIT_MESSAGE, followAreaEdit, limitArea, limitPoint, MAX_AREA_SIDE, setAreaEdit, shiftIntoLimit, visibleAreaOf } from "./area";
import { createEditSession } from "./editSession";
import { parseHistory, serializeHistory } from "./historyFile";
import { encodeRgbaPng } from "./png";
import { hasChunk } from "./testing";

const W = 100;
const H = 80;
const capture = () => encodeRgbaPng(W, H, new Uint8Array(W * H * 4).fill(255));
const make = () => createEditSession(createFromCapture(capture()));
const rect = (id: string, x: number, y: number, width = 10, height = 10): RectAnnotation => ({
  id,
  type: "rect",
  x,
  y,
  width,
  height,
  stroke: { color: "#e02424", width: 4 },
  fill: { mode: "none", color: "#facc15", opacity: 0.4 },
});

describe("the visible area may extend past the Capture", () => {
  it("is the whole Capture until a crop is set", () => {
    expect(visibleAreaOf(make().image)).toEqual({ x: 0, y: 0, width: W, height: H });
  });

  it("a crop wider than the Capture is the area; widening or cropping back to exactly the Capture is no crop", () => {
    const session = make();
    const wider = { x: -20, y: -10, width: 150, height: 120 };
    session.apply(setAreaEdit(session.image, wider, "white").edit!);
    expect(session.image.model.crop).toEqual(wider);
    expect(visibleAreaOf(session.image)).toEqual(wider);

    session.apply(setAreaEdit(session.image, { x: 0, y: 0, width: W, height: H }, "white").edit!);
    expect(session.image.model.crop).toBeNull();
  });

  it("crop round-trips: in, then out past the edge, then undo twice", () => {
    const session = make();
    session.apply(setAreaEdit(session.image, { x: 10, y: 10, width: 50, height: 40 }, "dark").edit!);
    session.apply(setAreaEdit(session.image, { x: -5, y: 10, width: 120, height: 40 }, "dark").edit!);
    session.undo();
    expect(session.image.model.crop).toEqual({ x: 10, y: 10, width: 50, height: 40 });
    session.undo();
    expect(session.image.model.crop).toBeNull();
  });

  it("the first area that reaches past the Capture stores the default background; one inside the Capture does not", () => {
    const session = make();
    session.apply(setAreaEdit(session.image, { x: 10, y: 10, width: 50, height: 40 }, "dark").edit!);
    expect(session.image.model.background).toBeUndefined();

    session.apply(setAreaEdit(session.image, { x: 10, y: 10, width: 150, height: 40 }, "dark").edit!);
    expect(session.image.model.background).toBe("dark");

    // One undo step: the area and the stored default go back together.
    session.undo();
    expect(session.image.model.background).toBeUndefined();
    expect(session.image.model.crop).toEqual({ x: 10, y: 10, width: 50, height: 40 });
  });

  it("an image that already has a background keeps it when the default differs", () => {
    const session = make();
    session.apply({ kind: "setBackground", background: "white" });
    session.apply(setAreaEdit(session.image, { x: -10, y: 0, width: 120, height: 80 }, "transparent").edit!);
    expect(session.image.model.background).toBe("white");
  });

  it("setting the area it already has is not an edit", () => {
    const session = make();
    expect(setAreaEdit(session.image, { x: 0, y: 0, width: W, height: H }, "white").edit).toBeNull();
  });
});

describe("the 8192 px limit", () => {
  it("clamps an area that is too big, says so, and leaves a smaller one alone", () => {
    expect(MAX_AREA_SIDE).toBe(8192);
    expect(AREA_LIMIT_MESSAGE).toMatch(/8192/);
    const previous = { x: 0, y: 0, width: W, height: H };

    const fine = limitArea({ x: -50, y: 0, width: 300, height: 80 }, previous);
    expect(fine).toEqual({ area: { x: -50, y: 0, width: 300, height: 80 }, limited: false });

    // Grown to the right only: the left edge stays, the right is cut at the limit.
    const right = limitArea({ x: 0, y: 0, width: 9000, height: H }, previous);
    expect(right.limited).toBe(true);
    expect(right.area).toEqual({ x: 0, y: 0, width: 8192, height: H });

    // Grown to the left only: the right edge stays.
    const left = limitArea({ x: W - 9000, y: 0, width: 9000, height: H }, previous);
    expect(left.area).toEqual({ x: W - 8192, y: 0, width: 8192, height: H });
    expect(left.limited).toBe(true);
  });

  it("an image that is already wider than the limit is not shrunk, only stopped from growing", () => {
    const previous = { x: 0, y: 0, width: 10000, height: 100 };
    expect(limitArea(previous, previous)).toEqual({ area: previous, limited: false });
    expect(limitArea({ x: 0, y: 0, width: 10500, height: 100 }, previous).area.width).toBe(10000);
  });

  it("setAreaEdit applies the limit and reports it", () => {
    const session = make();
    const result = setAreaEdit(session.image, { x: 0, y: 0, width: 20000, height: H }, "white");
    expect(result.limited).toBe(true);
    session.apply(result.edit!);
    expect(session.image.model.crop!.width).toBe(8192);
  });
});

describe("how far a drag may reach (M4 fixes C)", () => {
  const area = { x: 0, y: 0, width: W, height: H };

  it("a pointer anywhere that keeps the area within the limit is left where it is, however far from the area", () => {
    expect(limitPoint(area, { x: 5000, y: -3000 })).toEqual({ point: { x: 5000, y: -3000 }, limited: false });
    expect(limitPoint(area, { x: -(MAX_AREA_SIDE - W), y: MAX_AREA_SIDE })).toEqual({
      point: { x: -(MAX_AREA_SIDE - W), y: MAX_AREA_SIDE },
      limited: false,
    });
  });

  it("a pointer further than that is stopped at the limit on that side, and the drag says so", () => {
    expect(limitPoint(area, { x: 50000, y: 10 })).toEqual({ point: { x: MAX_AREA_SIDE, y: 10 }, limited: true });
    expect(limitPoint(area, { x: -50000, y: -9000 })).toEqual({ point: { x: W - MAX_AREA_SIDE, y: H - MAX_AREA_SIDE }, limited: true });
  });

  it("an area that is already wider than the limit is not pushed further out", () => {
    const wide = { x: 0, y: 0, width: 10000, height: 100 };
    expect(limitPoint(wide, { x: 12000, y: 50 }).point).toEqual({ x: 10000, y: 50 });
    expect(limitPoint(wide, { x: -5, y: 50 })).toEqual({ point: { x: 0, y: 50 }, limited: true });
    expect(limitPoint(wide, { x: 9000, y: 50 })).toEqual({ point: { x: 9000, y: 50 }, limited: false });
  });

  it("a moved Annotation is shifted back just enough to keep the area within the limit, and only along the axis that needs it", () => {
    const box = { x: 9000, y: 10, width: 40, height: 20 };
    expect(shiftIntoLimit(area, box)).toEqual({ dx: MAX_AREA_SIDE - 9040, dy: 0 });
    expect(shiftIntoLimit(area, { x: -9000, y: -9000, width: 40, height: 20 })).toEqual({ dx: W - MAX_AREA_SIDE + 9000, dy: H - MAX_AREA_SIDE + 9000 });
    expect(shiftIntoLimit(area, { x: 50, y: 10, width: 40, height: 20 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe("auto-grow", () => {
  it("an Annotation inside the area is added as it is", () => {
    const session = make();
    const grown = followAreaEdit(session.image, { kind: "add", annotation: rect("a", 10, 10) }, { x: 8, y: 8, width: 14, height: 14 }, "white");
    expect(grown.edit.kind).toBe("add");
    expect(grown.limited).toBe(false);
  });

  it("an Annotation past the edge grows the area to include it, and the edit and growth are one undo step", () => {
    const session = make();
    const a = rect("a", 90, 70, 40, 30);
    const grown = followAreaEdit(session.image, { kind: "add", annotation: a }, { x: 88, y: 68, width: 44, height: 34 }, "dark");
    session.apply(grown.edit);

    expect(session.image.model.annotations.map((x) => x.id)).toEqual(["a"]);
    expect(session.image.model.crop).toEqual({ x: 0, y: 0, width: 132, height: 102 });
    expect(session.image.model.background).toBe("dark");

    expect(session.undo()).toBe(true);
    expect(session.image.model.annotations).toEqual([]);
    expect(session.image.model.crop).toBeNull();
    expect(session.image.model.background).toBeUndefined();
    expect(session.canUndo).toBe(false);

    session.redo();
    expect(session.image.model.crop).toEqual({ x: 0, y: 0, width: 132, height: 102 });
    expect(session.image.model.annotations).toHaveLength(1);
  });

  it("moving an Annotation out grows to the left and top, in whole pixels", () => {
    const session = make();
    session.apply({ kind: "add", annotation: rect("a", 10, 10) });
    const grown = followAreaEdit(session.image, { kind: "update", id: "a", patch: { x: -20.4, y: -7.2 } }, { x: -22.4, y: -9.2, width: 14, height: 14 }, "white");
    session.apply(grown.edit);
    expect(session.image.model.crop).toEqual({ x: -23, y: -10, width: 123, height: 90 });
    session.undo();
    expect(session.image.model.crop).toBeNull();
    expect((session.image.model.annotations[0] as RectAnnotation).x).toBe(10);
  });

  it("moving the Annotation back inside no longer holds the area open (shrink-back: see areaShrink.test.ts)", () => {
    const session = make();
    session.apply({ kind: "add", annotation: rect("a", 10, 10) });
    session.apply(followAreaEdit(session.image, { kind: "update", id: "a", patch: { x: 150 } }, { x: 148, y: 8, width: 14, height: 14 }, "white").edit);
    expect(session.image.model.crop).not.toBeNull();
    session.apply(followAreaEdit(session.image, { kind: "update", id: "a", patch: { x: 20 } }, { x: 18, y: 8, width: 14, height: 14 }, "white").edit);
    expect(session.image.model.crop).toBeNull();
  });

  it("growth stops at the 8192 limit and says so; the edit itself still happens", () => {
    const session = make();
    const grown = followAreaEdit(session.image, { kind: "add", annotation: rect("a", 0, 0) }, { x: 0, y: 0, width: 9000, height: 10 }, "white");
    expect(grown.limited).toBe(true);
    session.apply(grown.edit);
    expect(session.image.model.crop!.width).toBe(8192);
    expect(session.image.model.annotations).toHaveLength(1);
  });

  it("with no bounds (a paste, a style change) it never grows", () => {
    const session = make();
    const grown = followAreaEdit(session.image, { kind: "add", annotation: rect("a", 500, 500) }, undefined, "white");
    expect(grown.edit.kind).toBe("add");
  });

  it("a grown step survives the history file", () => {
    const first = make();
    first.apply(followAreaEdit(first.image, { kind: "add", annotation: rect("a", 90, 0, 40, 10) }, { x: 90, y: 0, width: 40, height: 10 }, "white").edit);
    const file = parseHistory(serializeHistory({ hash: "h", touchedAt: 1, history: first.history }))!;
    expect(file).not.toBeNull();
    const second = createEditSession(first.image, { history: file.history });
    expect(second.undo()).toBe(true);
    expect(second.image.model.crop).toBeNull();
    expect(second.image.model.annotations).toEqual([]);
  });
});

describe("the background", () => {
  it("is one undo step per change and undo restores the previous value", () => {
    const session = make();
    session.apply({ kind: "setBackground", background: "white" });
    session.apply({ kind: "setBackground", background: "transparent" });
    session.apply({ kind: "setBackground", background: "transparent" });
    expect(session.image.model.background).toBe("transparent");
    session.undo();
    expect(session.image.model.background).toBe("white");
    session.undo();
    expect(session.image.model.background).toBeUndefined();
    expect(session.canUndo).toBe(false);
  });

  it("is saved with the image, and a file without one loads with none", async () => {
    const session = make();
    session.apply({ kind: "setBackground", background: "dark" });
    const render = async () => capture();
    const decoded = decodeLibraryPng(await encodeLibraryPng(session.image, render));
    expect(decoded.model.background).toBe("dark");
    expect(decoded.model.formatVersion).toBe(1);

    const plain = decodeLibraryPng(await encodeLibraryPng(make().image));
    expect(plain.model.background).toBeUndefined();
    expect("background" in plain.model).toBe(false);
  });
});

describe("Export of an expanded image", () => {
  it("is handed to the renderer, carries no editable data, and leaves the Capture bytes alone", async () => {
    const session = make();
    session.apply(setAreaEdit(session.image, { x: -10, y: -10, width: 120, height: 100 }, "white").edit!);
    const original = session.image.capture.slice();
    const seen: unknown[] = [];
    const render = async (image: typeof session.image) => {
      seen.push(image.model.crop, image.model.background);
      return encodeRgbaPng(120, 100, new Uint8Array(120 * 100 * 4));
    };
    const png = await exportPng(session.image, render);
    expect(seen).toEqual([{ x: -10, y: -10, width: 120, height: 100 }, "white"]);
    expect(hasChunk(png, "snAP")).toBe(false);
    expect(hasChunk(png, "snIM")).toBe(false);

    const library = decodeLibraryPng(await encodeLibraryPng(session.image, render));
    expect(Array.from(library.capture)).toEqual(Array.from(original));
  });
});
