import { describe, expect, it } from "vitest";
import { sanitizeStyle } from "../propertyGroups";
import { calloutKind } from "./callout";

describe("Callout", () => {
  it("uses Font, Text outline, Stroke, Fill and the Tail switch, with the tail on by default", () => {
    expect(calloutKind.groups).toEqual(["font", "textOutline", "stroke", "fill", "tail"]);
    expect(calloutKind.defaultStyle.tail).toEqual({ enabled: true });
    expect(calloutKind.shortcutAction).toBe("tool.callout");
    expect(calloutKind.typedInPlace).toBe(true);
  });

  it("starts as an empty text box at the click with the default look and no tip yet", () => {
    const a = calloutKind.fromDrag("c", { x: 50, y: 60 }, { x: 50, y: 60 }, {}, { width: 600, height: 400 })!;
    expect(a).toMatchObject({ type: "callout", x: 50, y: 60, text: "", tail: { enabled: true } });
    expect(a.tip).toBeUndefined();
    expect(a.fill.mode).toBe("solid");
  });

  it("takes a restyled tool's groups", () => {
    const a = calloutKind.fromDrag("c", { x: 0, y: 0 }, { x: 0, y: 0 }, { tail: { enabled: false } })!;
    expect(a.tail.enabled).toBe(false);
  });
});

describe("tail group in a stored style", () => {
  it("keeps a boolean and drops anything else", () => {
    expect(sanitizeStyle({ tail: { enabled: false } })).toEqual({ tail: { enabled: false } });
    expect(sanitizeStyle({ tail: { enabled: "no" } })).toEqual({});
  });
});
