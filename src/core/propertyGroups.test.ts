// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_STROKE_WIDTH, MIN_STROKE_WIDTH, fillPaint, sanitizeStyle } from "./propertyGroups";

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

  it("gives nothing for something that is not an object", () => {
    expect(sanitizeStyle(null)).toEqual({});
    expect(sanitizeStyle("x")).toEqual({});
    expect(sanitizeStyle([1])).toEqual({});
  });
});
