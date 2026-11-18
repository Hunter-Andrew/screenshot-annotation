// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFromCapture, decodeLibraryPng, encodeLibraryPng } from "../annotatedImage";
import { applyEdit } from "../editSession";
import { encodeRgbaPngCompressed } from "../png";
import { sanitizeStyle } from "../propertyGroups";
import { clampFontSize, FONT_SIZE_PRESETS, textAreaFromDrag, textKind, type TextAnnotation } from "./text";

describe("Text kind", () => {
  it("is red with a white outline by default (spec: tools > Text)", () => {
    expect(textKind.defaultStyle).toEqual({
      font: { size: 24, bold: false, italic: false, color: "#e02424", align: "left", valign: "middle", underline: false },
      textOutline: { enabled: true, color: "#ffffff", width: 2 },
    });
  });

  it("opts into the Font and Text outline groups and the T shortcut, and is typed in place", () => {
    expect(textKind.groups).toEqual(["font", "textOutline"]);
    expect(textKind.shortcutAction).toBe("tool.text");
    expect(textKind.label).toBe("Text");
    expect(textKind.typedInPlace).toBe(true);
  });

  it("a click makes an empty box at the click, with a default wrap width", () => {
    const text = textKind.fromDrag("t1", { x: 40, y: 50 }, { x: 40, y: 50 }, textKind.defaultStyle);

    expect(text).toEqual({
      id: "t1",
      type: "text",
      x: 40,
      y: 50,
      width: 240,
      text: "",
      font: { size: 24, bold: false, italic: false, color: "#e02424", align: "left", valign: "middle", underline: false },
      textOutline: { enabled: true, color: "#ffffff", width: 2 },
    });
  });

  it("a drag sets the wrap width and may go in any direction", () => {
    const text = textKind.fromDrag("t1", { x: 300, y: 50 }, { x: 100, y: 90 }, textKind.defaultStyle)!;

    expect(text.x).toBe(100);
    expect(text.y).toBe(50);
    expect(text.width).toBe(200);
  });

  it("keeps the box inside the Capture when it is given the Capture's size", () => {
    const text = textKind.fromDrag("t1", { x: 190, y: 10 }, { x: 190, y: 10 }, textKind.defaultStyle, {
      width: 300,
      height: 100,
    })!;

    expect(text.x + text.width).toBe(300);
    expect(text.x).toBe(60);

    const narrow = textKind.fromDrag("t2", { x: 50, y: 10 }, { x: 50, y: 10 }, textKind.defaultStyle, {
      width: 100,
      height: 100,
    })!;
    expect(narrow.x).toBe(0);
    expect(narrow.width).toBe(100);
  });

  it("uses the style it is given", () => {
    const style = {
      font: { size: 48, bold: true, italic: true, color: "#2563eb" },
      textOutline: { enabled: false, color: "#000000", width: 5 },
    };
    const text = textKind.fromDrag("t1", { x: 0, y: 0 }, { x: 0, y: 0 }, style)!;

    expect(text.font).toEqual(style.font);
    expect(text.textOutline).toEqual(style.textOutline);
  });
});

describe("the area a drag defines for a text box (ticket 35)", () => {
  const capture = { width: 600, height: 300 };

  it("a drag down and right is the box: its top-left, its width, and its height as the minimum height", () => {
    expect(textAreaFromDrag({ x: 100, y: 50 }, { x: 300, y: 130 }, capture)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      minHeight: 80,
    });
  });

  it("a drag up and left defines the same box", () => {
    expect(textAreaFromDrag({ x: 300, y: 130 }, { x: 100, y: 50 }, capture)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      minHeight: 80,
    });
  });

  it("a drag past the Capture is clamped to it", () => {
    const area = textAreaFromDrag({ x: 500, y: 250 }, { x: 900, y: 700 }, capture);
    expect(area).toEqual({ x: 500, y: 250, width: 100, minHeight: 50 });
    const before = textAreaFromDrag({ x: 40, y: 20 }, { x: -300, y: -90 }, capture);
    expect(before).toEqual({ x: 0, y: 0, width: 40, minHeight: 20 });
  });

  it("a click (under 4 px of movement) is the default width at the click, with no minimum height", () => {
    const expected = { x: 100, y: 50, width: 240, minHeight: 0 };
    expect(textAreaFromDrag({ x: 100, y: 50 }, { x: 100, y: 50 }, capture)).toEqual(expected);
    expect(textAreaFromDrag({ x: 100, y: 50 }, { x: 103, y: 52 }, capture)).toEqual(expected);
  });

  it("a click near the right edge slides the default-width box back inside the Capture", () => {
    expect(textAreaFromDrag({ x: 590, y: 10 }, { x: 590, y: 10 }, capture)).toEqual({
      x: 360,
      y: 10,
      width: 240,
      minHeight: 0,
    });
  });

  it("a drag narrower than 20 px falls back to the default width and drops its height", () => {
    expect(textAreaFromDrag({ x: 100, y: 50 }, { x: 112, y: 200 }, capture)).toEqual({
      x: 100,
      y: 50,
      width: 240,
      minHeight: 0,
    });
    expect(textAreaFromDrag({ x: 100, y: 50 }, { x: 120, y: 200 }, capture).width).toBe(20);
  });

  it("is what fromDrag stores: x, y, width, and the minimum height only when there is one", () => {
    const dragged = textKind.fromDrag("t1", { x: 100, y: 50 }, { x: 300, y: 130 }, textKind.defaultStyle, capture)!;
    expect(dragged).toMatchObject({ x: 100, y: 50, width: 200, minHeight: 80 });
    const clicked = textKind.fromDrag("t2", { x: 100, y: 50 }, { x: 100, y: 50 }, textKind.defaultStyle, capture)!;
    expect(clicked).not.toHaveProperty("minHeight");
  });

  it("an image saved before there was a minimum height still loads", async () => {
    const old: TextAnnotation = {
      id: "t1", type: "text", x: 1, y: 2, width: 120, text: "old",
      font: { size: 24, bold: false, italic: false, color: "#e02424" },
      textOutline: { enabled: true, color: "#ffffff", width: 2 },
    };
    const capture = await encodeRgbaPngCompressed(2, 2, new Uint8Array(16).fill(255));
    const image = applyEdit(createFromCapture(capture), { kind: "add", annotation: { ...old, minHeight: 90 } });
    const decoded = decodeLibraryPng(await encodeLibraryPng(image, async (i) => i.capture));
    expect(decoded.model.annotations).toEqual([{ ...old, minHeight: 90 }]);
    expect(old).not.toHaveProperty("minHeight");
  });
});

describe("font size", () => {
  it("offers the preset sizes 10/12/14/18/24/32/48/72", () => {
    expect(FONT_SIZE_PRESETS).toEqual([10, 12, 14, 18, 24, 32, 48, 72]);
  });

  it("clamps a typed size to 8-200 and rounds it", () => {
    expect(clampFontSize(3)).toBe(8);
    expect(clampFontSize(500)).toBe(200);
    expect(clampFontSize(17.6)).toBe(18);
  });
});

describe("a stored Text style read back from settings.json", () => {
  it("keeps valid Font and Text outline groups and drops malformed ones", () => {
    const good = {
      font: { size: 40, bold: true, italic: false, color: "#2563eb" },
      textOutline: { enabled: false, color: "#000000", width: 4 },
    };
    expect(sanitizeStyle(good)).toEqual(good);
    expect(
      sanitizeStyle({
        font: { size: 500, bold: true, italic: false, color: "#2563eb" },
        textOutline: { enabled: "yes", color: "#000000", width: 4 },
      }),
    ).toEqual({});
  });
});

describe("Text in the saved file (ADR 0004/0005)", () => {
  const TEXT: TextAnnotation = {
    id: "t1",
    type: "text",
    x: 1,
    y: 2,
    width: 120,
    text: 'Hello\nsecond line, with "quotes" and é',
    font: { size: 32, bold: true, italic: true, color: "#2563eb" },
    textOutline: { enabled: true, color: "#ffffff", width: 3 },
  };

  it("round-trips through a Library PNG, still editable", async () => {
    const capture = await encodeRgbaPngCompressed(2, 2, new Uint8Array(16).fill(255));
    const image = applyEdit(createFromCapture(capture), { kind: "add", annotation: TEXT });
    const png = await encodeLibraryPng(image, async (i) => i.capture);

    const decoded = decodeLibraryPng(png);

    expect(decoded.model.annotations).toEqual([TEXT]);
    expect(decoded.readOnly).toBe(false);
  });
});
