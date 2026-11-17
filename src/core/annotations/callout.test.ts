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

describe("Callout draw gesture with the tail on", () => {
  const capture = { width: 600, height: 400 };
  const draw = (from: { x: number; y: number }, to: { x: number; y: number }, style = {}) =>
    calloutKind.fromDrag("c", from, to, style, capture)!;

  it("puts the tip where the press was and the box at the release, extending away from the press", () => {
    // Press at (100, 100), release at (300, 160): the box starts at the release and runs right and down.
    const a = draw({ x: 100, y: 100 }, { x: 300, y: 160 });
    expect(a).toMatchObject({ x: 300, y: 160, width: 200, minHeight: 60 });
    expect(a.tip).toEqual({ x: -200, y: -60 });
  });

  it("runs the box left and up when the release is left of and above the press", () => {
    const a = draw({ x: 500, y: 300 }, { x: 300, y: 240 });
    expect(a).toMatchObject({ x: 100, y: 180, width: 200, minHeight: 60 });
    expect(a.tip).toEqual({ x: 400, y: 120 });
  });

  it("uses the default width for a short horizontal drag and keeps the box inside the Capture", () => {
    const a = draw({ x: 560, y: 100 }, { x: 570, y: 120 });
    expect(a.width).toBe(240);
    expect(a.x).toBe(360);
    expect(a.x + a.width).toBeLessThanOrEqual(600);
    expect(a.tip).toEqual({ x: 200, y: -20 });
  });

  it("keeps a plain click as a default box at the click with no tip", () => {
    const a = draw({ x: 50, y: 60 }, { x: 51, y: 61 });
    expect(a).toMatchObject({ x: 50, y: 60, width: 240 });
    expect(a.tip).toBeUndefined();
  });

  it("with the tail off, press and release stay opposite corners of the text area", () => {
    const a = draw({ x: 100, y: 100 }, { x: 300, y: 160 }, { tail: { enabled: false } });
    expect(a).toMatchObject({ x: 100, y: 100, width: 200, minHeight: 60 });
    expect(a.tip).toBeUndefined();
  });
});
