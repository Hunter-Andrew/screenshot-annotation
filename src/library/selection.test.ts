import { describe, expect, it } from "vitest";
import { clickThumbnail, NO_SELECTION, pruneSelection, type Selection } from "./selection";

const order = ["a", "b", "c", "d", "e"];
const plain = { ctrl: false, shift: false };
const ctrl = { ctrl: true, shift: false };
const shift = { ctrl: false, shift: true };
const picked = (r: ReturnType<typeof clickThumbnail>): Selection => {
  if (r.kind !== "select") throw new Error("expected a selection");
  return r.selection;
};
const names = (s: Selection) => [...s.selected].sort();

describe("clickThumbnail", () => {
  it("a plain click opens the image and does not select it", () => {
    expect(clickThumbnail(NO_SELECTION, order, "b", plain, "a")).toEqual({ kind: "open" });
  });

  it("Ctrl+click adds one at a time and a second Ctrl+click removes it", () => {
    let s = picked(clickThumbnail(NO_SELECTION, order, "b", ctrl, "a"));
    expect(names(s)).toEqual(["b"]);
    s = picked(clickThumbnail(s, order, "d", ctrl, "a"));
    expect(names(s)).toEqual(["b", "d"]);
    s = picked(clickThumbnail(s, order, "b", ctrl, "a"));
    expect(names(s)).toEqual(["d"]);
  });

  it("Shift+click selects the range from the last one clicked, in either direction", () => {
    const first = picked(clickThumbnail(NO_SELECTION, order, "b", ctrl, "a"));
    expect(names(picked(clickThumbnail(first, order, "d", shift, "a")))).toEqual(["b", "c", "d"]);
    expect(names(picked(clickThumbnail(first, order, "a", shift, "a")))).toEqual(["a", "b"]);
  });

  it("Shift+click again re-ranges from the same anchor instead of growing", () => {
    const first = picked(clickThumbnail(NO_SELECTION, order, "b", ctrl, "a"));
    const wide = picked(clickThumbnail(first, order, "e", shift, "a"));
    expect(names(wide)).toEqual(["b", "c", "d", "e"]);
    expect(names(picked(clickThumbnail(wide, order, "c", shift, "a")))).toEqual(["b", "c"]);
  });

  it("a first Shift+click ranges from the image open in the editor", () => {
    expect(names(picked(clickThumbnail(NO_SELECTION, order, "d", shift, "b")))).toEqual(["b", "c", "d"]);
  });

  it("with nothing open and nothing clicked, Shift+click selects just that one", () => {
    expect(names(picked(clickThumbnail(NO_SELECTION, order, "c", shift, null)))).toEqual(["c"]);
  });

  it("Ctrl+Shift+click adds the range to what is already selected", () => {
    const s = picked(clickThumbnail(NO_SELECTION, order, "a", ctrl, null));
    const more = picked(clickThumbnail(s, order, "e", { ctrl: true, shift: true }, null));
    expect(names(more)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("a path not in the list selects only itself", () => {
    expect(names(picked(clickThumbnail(NO_SELECTION, order, "zzz", shift, "a")))).toEqual(["zzz"]);
  });
});

describe("pruneSelection", () => {
  it("drops images that left the Library, keeps the same object when nothing changed", () => {
    const s = picked(clickThumbnail(NO_SELECTION, order, "b", ctrl, null));
    expect(pruneSelection(s, new Set(order))).toBe(s);
    const pruned = pruneSelection(s, new Set(["a", "c"]));
    expect(names(pruned)).toEqual([]);
    expect(pruned.anchor).toBeNull();
  });
});
