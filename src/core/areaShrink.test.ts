// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFromCapture, decodeLibraryPng, encodeLibraryPng } from "./annotatedImage";
import type { RectAnnotation } from "./annotation";
import { MAX_AREA_SIDE, followAreaEdit, setAreaEdit, visibleAreaOf } from "./area";
import { createEditSession, type Edit, type EditSession } from "./editSession";
import { parseHistory, serializeHistory } from "./historyFile";
import { encodeRgbaPng } from "./png";

// Shrink-back of an auto-grown area (M4 polish B): the model records which Annotations caused the growth and the
// base area they grew from; the area follows them back in when they shrink, move inside or are deleted.

const W = 100;
const H = 80;
const CAPTURE = { x: 0, y: 0, width: W, height: H };
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
const boundsOf = (a: RectAnnotation) => ({ x: a.x, y: a.y, width: a.width, height: a.height });

/** What the editor does for an Annotation drawn or moved: the edit with the area following it. */
function draw(session: EditSession, annotation: RectAnnotation) {
  session.apply(followAreaEdit(session.image, { kind: "add", annotation }, boundsOf(annotation), "dark").edit);
}
function move(session: EditSession, id: string, patch: Partial<RectAnnotation>) {
  const current = session.image.model.annotations.find((a) => a.id === id) as RectAnnotation;
  const next = { ...current, ...patch };
  session.apply(followAreaEdit(session.image, { kind: "update", id, patch }, boundsOf(next), "dark").edit);
}
function remove(session: EditSession, id: string) {
  session.apply(followAreaEdit(session.image, { kind: "delete", id }, undefined, "dark").edit);
}
const area = (s: EditSession) => visibleAreaOf(s.image);

describe("shrink-back", () => {
  it("drawing a rectangle past the edge grows the area; moving it back inside returns the area to the Capture", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 40, 20));
    expect(area(s)).toEqual({ x: 0, y: 0, width: 130, height: H });
    expect(s.image.model.crop).not.toBeNull();

    move(s, "a", { x: 20 });
    expect(area(s)).toEqual(CAPTURE);
    expect(s.image.model.crop).toBeNull();
    expect(s.image.model.grownBy).toBeUndefined();
    expect(s.image.model.areaBase).toBeUndefined();
  });

  it("making a grower smaller (a resize) shrinks the area to the new extent, never below the base", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 60, 20));
    expect(area(s).width).toBe(150);
    move(s, "a", { width: 30 });
    expect(area(s)).toEqual({ x: 0, y: 0, width: 120, height: H });
    move(s, "a", { width: 2, x: 10 });
    expect(area(s)).toEqual(CAPTURE);
  });

  it("two growers: deleting one shrinks to the other", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 40, 10)); // to 130
    draw(s, rect("b", 0, 70, 10, 50)); // to 120 down
    expect(area(s)).toEqual({ x: 0, y: 0, width: 130, height: 120 });
    remove(s, "a");
    expect(area(s)).toEqual({ x: 0, y: 0, width: W, height: 120 });
    remove(s, "b");
    expect(area(s)).toEqual(CAPTURE);
  });

  it("an Annotation inside the area but outside the base keeps the area open while another cause goes", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 60, 10)); // to 150
    draw(s, rect("b", 110, 30, 20, 10)); // inside the grown area, outside the base: a cause too
    remove(s, "a");
    expect(area(s)).toEqual({ x: 0, y: 0, width: 130, height: H });
  });

  it("deleting the grower shrinks, and one Undo brings back the Annotation and the area together; Redo repeats", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 40, 20));
    remove(s, "a");
    expect(area(s)).toEqual(CAPTURE);
    expect(s.undo()).toBe(true);
    expect(s.image.model.annotations.map((a) => a.id)).toEqual(["a"]);
    expect(area(s)).toEqual({ x: 0, y: 0, width: 130, height: H });
    expect(s.redo()).toBe(true);
    expect(area(s)).toEqual(CAPTURE);
    expect(s.image.model.annotations).toEqual([]);
    // And after undoing everything the image is as it was.
    s.undo();
    s.undo();
    expect(s.image.model.crop).toBeNull();
    expect(s.image.model.grownBy).toBeUndefined();
    expect(s.canUndo).toBe(false);
  });

  it("shrink-back is part of the same undo step as the edit that caused it", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 40, 20));
    move(s, "a", { x: 20 });
    expect(area(s)).toEqual(CAPTURE);
    s.undo();
    expect((s.image.model.annotations[0] as RectAnnotation).x).toBe(90);
    expect(area(s)).toEqual({ x: 0, y: 0, width: 130, height: H });
    s.redo();
    expect(area(s)).toEqual(CAPTURE);
  });

  it("never shrinks below an explicit Crop: the base is the Crop the user set", () => {
    const s = make();
    s.apply(setAreaEdit(s.image, { x: 10, y: 10, width: 50, height: 40 }, "dark").edit!);
    draw(s, rect("a", 40, 20, 60, 10)); // reaches x = 100
    expect(area(s)).toEqual({ x: 10, y: 10, width: 90, height: 40 });
    remove(s, "a");
    expect(area(s)).toEqual({ x: 10, y: 10, width: 50, height: 40 });
    expect(s.image.model.crop).toEqual({ x: 10, y: 10, width: 50, height: 40 });
  });

  it("an explicit Crop after growth is final: the record is cleared and nothing shrinks afterwards", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 40, 20));
    s.apply(setAreaEdit(s.image, { x: 0, y: 0, width: 130, height: H }, "dark").edit!); // same area, set explicitly
    expect(s.image.model.grownBy).toBeUndefined();
    expect(s.image.model.areaBase).toBeUndefined();
    remove(s, "a");
    expect(area(s)).toEqual({ x: 0, y: 0, width: 130, height: H });

    // A different explicit area (handle drag) behaves the same.
    const t = make();
    draw(t, rect("a", 90, 10, 40, 20));
    t.apply(setAreaEdit(t.image, { x: 0, y: 0, width: 120, height: 60 }, "dark").edit!);
    move(t, "a", { x: 0 }); // now inside the crop
    expect(area(t)).toEqual({ x: 0, y: 0, width: 120, height: 60 });
  });

  it("the explicit Crop and the cleared record are one undo step", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 40, 20));
    s.apply(setAreaEdit(s.image, { x: 0, y: 0, width: 120, height: 60 }, "dark").edit!);
    s.undo();
    expect(area(s)).toEqual({ x: 0, y: 0, width: 130, height: H });
    expect(s.image.model.grownBy).toHaveLength(1);
    remove(s, "a");
    expect(area(s)).toEqual(CAPTURE); // shrinks again: the record was restored
  });

  it("growth after an explicit area is a new cycle whose base is that area", () => {
    const s = make();
    s.apply(setAreaEdit(s.image, { x: 0, y: 0, width: 120, height: 60 }, "dark").edit!);
    draw(s, rect("b", 110, 0, 30, 10));
    expect(area(s).width).toBe(140);
    remove(s, "b");
    expect(area(s)).toEqual({ x: 0, y: 0, width: 120, height: 60 });
  });

  it("an old file with a grown crop and no record is unchanged by editing inside it", () => {
    const s = make();
    s.apply(setAreaEdit(s.image, { x: 0, y: 0, width: 140, height: H }, "white").edit!);
    s.apply({ kind: "add", annotation: rect("a", 120, 10) });
    remove(s, "a");
    expect(area(s)).toEqual({ x: 0, y: 0, width: 140, height: H });
    expect(s.image.model.grownBy).toBeUndefined();
  });

  it("the 8192 limit still applies to the area, and removing the cause comes back", () => {
    const s = make();
    draw(s, rect("a", 0, 0, 9000, 10));
    expect(area(s).width).toBe(MAX_AREA_SIDE);
    remove(s, "a");
    expect(area(s)).toEqual(CAPTURE);
  });

  it("an edit without bounds (style change) leaves the area and the record alone", () => {
    const s = make();
    draw(s, rect("a", 90, 10, 40, 20));
    const before = s.image.model;
    const result = followAreaEdit(s.image, { kind: "update", id: "a", patch: { stroke: { color: "#000000", width: 2 } } }, undefined, "dark");
    expect(result.edit.kind).toBe("update");
    s.apply(result.edit);
    expect(s.image.model.crop).toEqual(before.crop);
    expect(s.image.model.grownBy).toEqual(before.grownBy);
  });

  it("is saved with the image and survives the history file", async () => {
    const s = make();
    draw(s, rect("a", 90, 10, 40, 20));
    const decoded = decodeLibraryPng(await encodeLibraryPng(s.image, async () => capture()));
    expect(decoded.model.areaBase).toEqual(CAPTURE);
    expect(decoded.model.grownBy?.map((c) => c.id)).toEqual(["a"]);
    expect(decoded.model.formatVersion).toBe(1);

    remove(s, "a");
    const file = parseHistory(serializeHistory({ hash: "h", touchedAt: 1, history: s.history }))!;
    expect(file).not.toBeNull();
    const again = createEditSession(s.image, { history: file.history });
    // Undo of the delete (with the shrink) brings back the Annotation, the area and the record.
    expect(again.undo()).toBe(true);
    expect(area(again)).toEqual({ x: 0, y: 0, width: 130, height: H });
    expect(again.image.model.grownBy).toHaveLength(1);
  });

  it("a plain image never gets the fields", () => {
    const s = make();
    expect("grownBy" in s.image.model).toBe(false);
    expect("areaBase" in s.image.model).toBe(false);
    const edit: Edit = followAreaEdit(s.image, { kind: "add", annotation: rect("a", 10, 10) }, { x: 10, y: 10, width: 10, height: 10 }, "dark").edit;
    expect(edit.kind).toBe("add");
  });
});

describe("showOutside", () => {
  it("is one undo step per change; a missing value is true", () => {
    const s = make();
    expect(s.image.model.showOutside).toBeUndefined();
    s.apply({ kind: "setShowOutside", showOutside: false });
    s.apply({ kind: "setShowOutside", showOutside: false });
    expect(s.image.model.showOutside).toBe(false);
    s.apply({ kind: "setShowOutside", showOutside: true });
    s.undo();
    expect(s.image.model.showOutside).toBe(false);
    s.undo();
    expect(s.image.model.showOutside).toBeUndefined();
    expect(s.canUndo).toBe(false);
  });

  it("a new image takes the Settings default; a file without the field loads without it", async () => {
    const off = createFromCapture(capture(), { showOutside: false });
    expect(off.model.showOutside).toBe(false);
    expect(createFromCapture(capture(), { showOutside: true }).model.showOutside).toBe(true);
    expect("showOutside" in createFromCapture(capture()).model).toBe(false);

    const decoded = decodeLibraryPng(await encodeLibraryPng(off));
    expect(decoded.model.showOutside).toBe(false);
    const old = decodeLibraryPng(await encodeLibraryPng(createFromCapture(capture())));
    expect("showOutside" in old.model).toBe(false);
  });

  it("survives the history file", () => {
    const s = make();
    s.apply({ kind: "setShowOutside", showOutside: false });
    const file = parseHistory(serializeHistory({ hash: "h", touchedAt: 1, history: s.history }))!;
    expect(file).not.toBeNull();
    const again = createEditSession(s.image, { history: file.history });
    again.undo();
    expect(again.image.model.showOutside).toBeUndefined();
  });
});
