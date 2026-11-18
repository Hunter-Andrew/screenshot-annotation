// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_ERASER_SIZE, MIN_ERASER_SIZE, MAX_STROKE_WIDTH, MIN_STROKE_WIDTH, fillPaint, isUnderlined, sanitizeStyle, valignOf } from "./propertyGroups";

describe("Stroke thickness limits", () => {
  it("are 1 to 30 and are the exact edges sanitizeStyle accepts", () => {
    expect([MIN_STROKE_WIDTH, MAX_STROKE_WIDTH]).toEqual([1, 30]);
    const read = (width: number) => sanitizeStyle({ stroke: { color: "#000000", width } });
    expect(read(MIN_STROKE_WIDTH)).toEqual({ stroke: { color: "#000000", width: MIN_STROKE_WIDTH } });
    expect(read(MAX_STROKE_WIDTH)).toEqual({ stroke: { color: "#000000", width: MAX_STROKE_WIDTH } });
    expect(read(MIN_STROKE_WIDTH - 1)).toEqual({});
    expect(read(MAX_STROKE_WIDTH + 1)).toEqual({});
  });
});

describe("fillPaint", () => {
  it("is nothing for 'none', whatever the color and opacity say", () => {
    expect(fillPaint({ mode: "none", color: "#ff0000", opacity: 0.5 })).toBeNull();
  });

  it("is the opaque color for 'solid', ignoring the opacity", () => {
    expect(fillPaint({ mode: "solid", color: "#ff0000", opacity: 0.2 })).toBe("rgba(255, 0, 0, 1)");
  });

  it("is the color at the given opacity for 'semi'", () => {
    expect(fillPaint({ mode: "semi", color: "#2563eb", opacity: 0.4 })).toBe("rgba(37, 99, 235, 0.4)");
  });
});

describe("sanitizeStyle (what a settings.json from anywhere may hold)", () => {
  it("keeps a valid style as it is", () => {
    const style = {
      stroke: { color: "#2563eb", width: 8 },
      fill: { mode: "semi", color: "#facc15", opacity: 0.25 },
      arrowheads: { ends: "both" },
    };
    expect(sanitizeStyle(style)).toEqual(style);
  });

  it("drops groups that are malformed and keeps the rest", () => {
    expect(
      sanitizeStyle({
        stroke: { color: "red", width: 8 },
        fill: { mode: "gradient", color: "#000000", opacity: 1 },
        arrowheads: { ends: "end" },
        mystery: { a: 1 },
      }),
    ).toEqual({ arrowheads: { ends: "end" } });
  });

  it("rejects an out-of-range thickness or opacity, and rounds a fractional thickness", () => {
    expect(sanitizeStyle({ stroke: { color: "#000000", width: 31 } })).toEqual({});
    expect(sanitizeStyle({ stroke: { color: "#000000", width: 0 } })).toEqual({});
    expect(sanitizeStyle({ stroke: { color: "#000000", width: 3.6 } })).toEqual({ stroke: { color: "#000000", width: 4 } });
    expect(sanitizeStyle({ fill: { mode: "semi", color: "#000000", opacity: 1.5 } })).toEqual({});
  });

  it("keeps a text alignment, treats a missing one as the stored style it is, and drops an unknown one", () => {
    const font = { size: 24, bold: false, italic: false, color: "#e02424" };
    expect(sanitizeStyle({ font: { ...font, align: "center" } })).toEqual({ font: { ...font, align: "center" } });
    expect(sanitizeStyle({ font })).toEqual({ font }); // saved before alignment existed
    expect(sanitizeStyle({ font: { ...font, align: "justify" } })).toEqual({ font });
    expect(sanitizeStyle({ font: { ...font, align: 3 } })).toEqual({ font });
  });

  it("keeps a vertical alignment and an underline, leaves a missing one missing, and drops an unknown one", () => {
    const font = { size: 24, bold: false, italic: false, color: "#e02424" };
    expect(sanitizeStyle({ font: { ...font, valign: "middle", underline: true } })).toEqual({ font: { ...font, valign: "middle", underline: true } });
    expect(sanitizeStyle({ font: { ...font, valign: "bottom", underline: false } })).toEqual({ font: { ...font, valign: "bottom", underline: false } });
    expect(sanitizeStyle({ font })).toEqual({ font }); // saved before either existed: neither is invented
    expect(sanitizeStyle({ font: { ...font, valign: "center", underline: "yes" } })).toEqual({ font });
  });

  it("reads a missing vertical alignment as top (an older text keeps its look) and a missing underline as off", () => {
    const font = { size: 24, bold: false, italic: false, color: "#e02424" };
    expect(valignOf(font)).toBe("top");
    expect(valignOf({ ...font, valign: "middle" })).toBe("middle");
    expect(valignOf({ ...font, valign: "bottom" })).toBe("bottom");
    expect(isUnderlined(font)).toBe(false);
    expect(isUnderlined({ ...font, underline: true })).toBe(true);
  });

  it("gives nothing for something that is not an object", () => {
    expect(sanitizeStyle(null)).toEqual({});
    expect(sanitizeStyle("x")).toEqual({});
    expect(sanitizeStyle([1])).toEqual({});
  });
});

describe("the Pen's Eraser group", () => {
  it("is 4 to 100 px, and those are the exact edges sanitizeStyle accepts", () => {
    expect([MIN_ERASER_SIZE, MAX_ERASER_SIZE]).toEqual([4, 100]);
    const read = (size: number) => sanitizeStyle({ eraser: { mode: "eraser", size } });
    expect(read(4)).toEqual({ eraser: { mode: "eraser", size: 4 } });
    expect(read(100)).toEqual({ eraser: { mode: "eraser", size: 100 } });
    expect(read(3)).toEqual({});
    expect(read(101)).toEqual({});
    expect(read(20.4)).toEqual({ eraser: { mode: "eraser", size: 20 } });
  });

  it("keeps both modes and drops an unknown mode or a malformed value", () => {
    expect(sanitizeStyle({ eraser: { mode: "pen", size: 20 } })).toEqual({ eraser: { mode: "pen", size: 20 } });
    expect(sanitizeStyle({ eraser: { mode: "smudge", size: 20 } })).toEqual({});
    expect(sanitizeStyle({ eraser: { mode: "eraser", size: "20" } })).toEqual({});
    expect(sanitizeStyle({ eraser: "eraser" })).toEqual({});
    expect(sanitizeStyle({ eraser: null })).toEqual({});
  });
});
