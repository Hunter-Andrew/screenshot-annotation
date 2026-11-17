import { describe, expect, it } from "vitest";
import { MAX_STRENGTH, MIN_STRENGTH, sanitizeStyle } from "../propertyGroups";
import { blurKind } from "./blur";

describe("Blur", () => {
  const style = blurKind.defaultStyle;

  it("has one property group, Strength, defaulting inside its range", () => {
    expect(blurKind.groups).toEqual(["strength"]);
    expect(blurKind.shortcutAction).toBe("tool.blur");
    expect(style.strength!.blockSize).toBe(12);
    expect(style.strength!.blockSize).toBeGreaterThanOrEqual(MIN_STRENGTH);
    expect(style.strength!.blockSize).toBeLessThanOrEqual(MAX_STRENGTH);
  });

  it("is the box a drag defines, whichever way it is dragged, with the tool's strength", () => {
    const a = blurKind.fromDrag("b", { x: 90, y: 70 }, { x: 10, y: 20 }, { strength: { blockSize: 20 } })!;
    expect(a).toEqual({ id: "b", type: "blur", x: 10, y: 20, width: 80, height: 50, strength: { blockSize: 20 } });
  });

  it("draws nothing for a click", () => {
    expect(blurKind.fromDrag("b", { x: 5, y: 5 }, { x: 7, y: 6 }, style)).toBeNull();
  });
});

describe("strength group in a stored style", () => {
  it("keeps whole block sizes from 4 to 40 and drops anything else", () => {
    expect(sanitizeStyle({ strength: { blockSize: 12 } })).toEqual({ strength: { blockSize: 12 } });
    expect(sanitizeStyle({ strength: { blockSize: 12.4 } })).toEqual({ strength: { blockSize: 12 } });
    expect(sanitizeStyle({ strength: { blockSize: 3 } })).toEqual({});
    expect(sanitizeStyle({ strength: { blockSize: 41 } })).toEqual({});
    expect(sanitizeStyle({ strength: { blockSize: "12" } })).toEqual({});
  });
});
