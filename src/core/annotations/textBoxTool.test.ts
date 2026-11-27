import { describe, expect, it } from "vitest";
import { calloutKind } from "./callout";
import { textBoxKind } from "./textBoxTool";

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

describe("Text box placement", () => {
  it("is not affected by the Text minimum width: a narrow drag stays narrow, a click is the default width", () => {
    const opts = { textMinWidth: 400 };
    expect(textBoxKind.fromDrag("t", { x: 100, y: 100 }, { x: 160, y: 180 }, {}, capture, opts)!.width).toBe(60);
    expect(textBoxKind.fromDrag("t", { x: 50, y: 60 }, { x: 50, y: 60 }, {}, capture, opts)!.width).toBe(240);
  });
});
