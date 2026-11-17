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
  // The speech box is the text box plus 10 px of padding all round; press = tip, release = the far corner of the speech box.
  const capture = { width: 600, height: 400 };
  const draw = (from: { x: number; y: number }, to: { x: number; y: number }, style = {}, options?: { tailPercent?: number }) =>
    calloutKind.fromDrag("c", from, to, style, capture, options)!;

  it("the tail takes 20% of the drag along the side that faces the tip and the box the rest, release at the far corner", () => {
    // Press (100,100), release (300,160): mostly horizontal. The tail is 20% of 200 = 40 px, so the speech box runs from
    // x 140 to 300 and from y 100 to 160: press and release are opposite ends of the whole callout.
    const a = draw({ x: 100, y: 100 }, { x: 300, y: 160 });
    expect(a).toMatchObject({ x: 150, y: 110, width: 140, minHeight: 40 }); // the text box: padding 10 inside the speech box
    expect(a.tip).toEqual({ x: -50, y: -10 }); // the press, relative to the text box
  });

  it("measures the tail along the vertical axis when the drag is mostly vertical", () => {
    // Press (100,100), release (140,300): the tail is 20% of 200 = 40 px, the speech box x 100 to 140, y 140 to 300.
    const a = draw({ x: 100, y: 100 }, { x: 140, y: 300 });
    expect(a).toMatchObject({ x: 110, y: 150, width: 20, minHeight: 140 });
    expect(a.tip).toEqual({ x: -10, y: -50 });
  });

  it("takes the percentage from the setting", () => {
    const a = draw({ x: 100, y: 100 }, { x: 300, y: 160 }, {}, { tailPercent: 50 });
    expect(a).toMatchObject({ x: 210, y: 110, width: 80, minHeight: 40 }); // tail 100 px, speech box x 200 to 300
    expect(a.tip).toEqual({ x: -110, y: -10 });
    const small = draw({ x: 100, y: 100 }, { x: 300, y: 160 }, {}, { tailPercent: 5 });
    expect(small).toMatchObject({ x: 120, width: 170 }); // tail 10 px, speech box x 110 to 300
  });

  it("works in every direction: the box ends at the release, the tip is at the press", () => {
    // Left and up: press (500,300), release (300,240). The tail is 40 px, the speech box x 300 to 460, y 240 to 300.
    const leftUp = draw({ x: 500, y: 300 }, { x: 300, y: 240 });
    expect(leftUp).toMatchObject({ x: 310, y: 250, width: 140, minHeight: 40 });
    expect(leftUp.tip).toEqual({ x: 190, y: 50 });
    // Left and down.
    const leftDown = draw({ x: 500, y: 100 }, { x: 300, y: 160 });
    expect(leftDown).toMatchObject({ x: 310, y: 110, width: 140, minHeight: 40 });
    expect(leftDown.tip).toEqual({ x: 190, y: -10 });
    // Right and up.
    const rightUp = draw({ x: 100, y: 300 }, { x: 140, y: 100 });
    expect(rightUp).toMatchObject({ x: 110, y: 110, width: 20, minHeight: 140 });
    expect(rightUp.tip).toEqual({ x: -10, y: 190 });
  });

  it("uses the default width for a drag too short to hold a text box, and keeps the box inside the visible area", () => {
    const a = draw({ x: 560, y: 100 }, { x: 590, y: 140 });
    expect(a.width).toBe(240);
    expect(a.x + a.width).toBeLessThanOrEqual(600);
    expect(a.tip!.x).toBeGreaterThan(0); // the press is right of the box's left edge after it slid left
    const narrow = draw({ x: 100, y: 100 }, { x: 118, y: 105 });
    expect(narrow.width).toBe(240);
    expect(narrow.x).toBeCloseTo(113.6, 5); // from the near edge of the speech box, away from the press
  });

  it("clamps the release inside the visible area", () => {
    const a = draw({ x: 100, y: 100 }, { x: 700, y: 160 });
    expect(a.x + a.width + 10).toBe(600); // the speech box ends at the right edge of the area
    expect(a).toMatchObject({ x: 210, width: 380 }); // tail 20% of the 500 px drag = 100, speech box x 200 to 600
    const inShiftedArea = calloutKind.fromDrag("c", { x: -40, y: 10 }, { x: -300, y: 60 }, {}, { x: -100, y: 0, width: 500, height: 300 })!;
    expect(inShiftedArea.x).toBeGreaterThanOrEqual(-100);
  });

  it("keeps a plain click as a default box at the click with no tip, whatever the percentage", () => {
    const a = draw({ x: 50, y: 60 }, { x: 51, y: 61 }, {}, { tailPercent: 40 });
    expect(a).toMatchObject({ x: 50, y: 60, width: 240 });
    expect(a.tip).toBeUndefined();
  });

  it("with the tail off, press and release stay opposite corners of the text area", () => {
    const a = draw({ x: 100, y: 100 }, { x: 300, y: 160 }, { tail: { enabled: false } }, { tailPercent: 40 });
    expect(a).toMatchObject({ x: 100, y: 100, width: 200, minHeight: 60 });
    expect(a.tip).toBeUndefined();
  });
});
