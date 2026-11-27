import { describe, expect, it } from "vitest";
import { calloutKind } from "./callout";
import { textBoxAreaFromDrag, textBoxKind } from "./textBoxTool";

const capture = { width: 800, height: 600 };

describe("Text box tool", () => {
  it("is the Callout without a tail: the same look and groups, its own tool and key", () => {
    expect(textBoxKind.defaultStyle).toEqual(calloutKind.defaultStyle);
    expect(textBoxKind.groups).toEqual(calloutKind.groups);
    expect(textBoxKind.label).toBe("Text box");
    expect(textBoxKind.shortcutAction).toBe("tool.textbox");
    expect(textBoxKind.typedInPlace).toBe(true);
    expect(textBoxKind.keepsEmptyText).toBe(true);
  });

  it("never has a tail or a tip, whatever the drag", () => {
    const a = textBoxKind.fromDrag("t", { x: 100, y: 100 }, { x: 300, y: 160 }, {}, capture)!;
    expect(a).toMatchObject({ type: "textbox", x: 100, y: 100, width: 200, minHeight: 60, text: "" });
    expect(a).not.toHaveProperty("tail");
    expect(a).not.toHaveProperty("tip");
  });
});

describe("Text box minimum width at placement", () => {
  it("a click gets the default width (240, like a placed Callout) with the default minimum", () => {
    expect(textBoxKind.fromDrag("t", { x: 50, y: 60 }, { x: 50, y: 60 }, {}, capture, { textBoxMinWidth: 240 })!.width).toBe(240);
  });

  it("widens a narrow drag to the minimum, keeping its left edge and its dragged height", () => {
    const a = textBoxKind.fromDrag("t", { x: 100, y: 100 }, { x: 160, y: 180 }, {}, capture, { textBoxMinWidth: 240 })!;
    expect(a).toMatchObject({ x: 100, y: 100, width: 240, minHeight: 80 });
  });

  it("a drag to the left keeps its right edge", () => {
    const a = textBoxKind.fromDrag("t", { x: 400, y: 100 }, { x: 340, y: 180 }, {}, capture, { textBoxMinWidth: 240 })!;
    expect(a).toMatchObject({ x: 160, width: 240 });
  });

  it("leaves a drag that is already wide enough alone", () => {
    const a = textBoxKind.fromDrag("t", { x: 100, y: 100 }, { x: 500, y: 180 }, {}, capture, { textBoxMinWidth: 240 })!;
    expect(a.width).toBe(400);
  });

  it("with 0 there is no minimum: a narrow drag stays narrow, and a click is the default width", () => {
    const narrow = textBoxKind.fromDrag("t", { x: 100, y: 100 }, { x: 130, y: 180 }, {}, capture, { textBoxMinWidth: 0 })!;
    expect(narrow.width).toBe(30);
    expect(textBoxKind.fromDrag("t", { x: 50, y: 60 }, { x: 50, y: 60 }, {}, capture, { textBoxMinWidth: 0 })!.width).toBe(240);
    expect(textBoxKind.fromDrag("t", { x: 100, y: 100 }, { x: 130, y: 180 }, {}, capture)!.width).toBe(30);
  });

  it("a bigger minimum widens a click too, and the box slides in to stay inside the visible area", () => {
    expect(textBoxKind.fromDrag("t", { x: 50, y: 60 }, { x: 50, y: 60 }, {}, capture, { textBoxMinWidth: 400 })!.width).toBe(400);
    const edge = textBoxAreaFromDrag({ x: 700, y: 10 }, { x: 760, y: 90 }, capture, 240);
    expect(edge).toMatchObject({ x: 560, width: 240 });
    expect(textBoxAreaFromDrag({ x: 10, y: 10 }, { x: 40, y: 90 }, { width: 150, height: 100 }, 240).width).toBe(150);
  });
});
