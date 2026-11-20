import { describe, expect, it } from "vitest";
import { sanitizeStyle } from "../propertyGroups";
import { highlightKind } from "./highlight";

describe("Highlighter", () => {
  const style = highlightKind.defaultStyle;

  it("starts as bright yellow at 60% (it multiplies, so it stays see-through) and uses Stroke and Opacity", () => {
    expect(highlightKind.groups).toEqual(["stroke", "opacity"]);
    expect(style.stroke).toEqual({ color: "#ffff00", width: 18 });
    expect(style.opacity!.value).toBe(0.6);
    expect(highlightKind.shortcutAction).toBe("tool.highlight");
  });

  it("keeps the points and the style of a stroke", () => {
    const a = highlightKind.fromPath!("h", [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 2 }], style)!;
    expect(a.type).toBe("highlight");
    expect(a.points[0]).toEqual({ x: 0, y: 0 });
    expect(a.points.at(-1)).toEqual({ x: 30, y: 2 });
    expect(a.opacity).toEqual(style.opacity);
  });

  it("draws nothing for a click that did not move", () => {
    expect(highlightKind.fromPath!("h", [{ x: 5, y: 5 }], style)).toBeNull();
    expect(highlightKind.fromPath!("h", [{ x: 5, y: 5 }, { x: 5, y: 5 }], style)).toBeNull();
  });

  it("opts into Shift for a straight horizontal stroke", () => {
    expect(highlightKind.horizontalWithShift).toBe(true);
  });
});

describe("opacity group in a stored style", () => {
  it("keeps 10-100% and drops anything else", () => {
    expect(sanitizeStyle({ opacity: { value: 0.4 } })).toEqual({ opacity: { value: 0.4 } });
    expect(sanitizeStyle({ opacity: { value: 0.05 } })).toEqual({});
    expect(sanitizeStyle({ opacity: { value: 2 } })).toEqual({});
    expect(sanitizeStyle({ opacity: { value: "0.5" } })).toEqual({});
  });
});
