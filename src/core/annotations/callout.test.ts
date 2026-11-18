import { describe, expect, it } from "vitest";
import { sanitizeStyle } from "../propertyGroups";
import { calloutKind, DEFAULT_CALLOUT_MIN_HEIGHT } from "./callout";

describe("Callout", () => {
  it("uses Font, Text outline, Stroke, Fill and the Tail switch, with the tail on by default", () => {
    expect(calloutKind.groups).toEqual(["font", "textOutline", "stroke", "fill", "tail"]);
    expect(calloutKind.defaultStyle.tail).toEqual({ enabled: true });
    expect(calloutKind.shortcutAction).toBe("tool.callout");
    expect(calloutKind.typedInPlace).toBe(true);
  });

  it("is still a Callout with no text (a Text Annotation is not)", async () => {
    expect(calloutKind.keepsEmptyText).toBe(true);
    const { textKind } = await import("./text");
    expect(textKind.keepsEmptyText).toBeFalsy();
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
  // The drag only places the tail: the press is the tip, the release is where the tail ends. The speech box (the text box
  // plus 10 px of padding all round) starts at the release, in its corner nearest the tip, and extends away from the tip.
  const capture = { width: 600, height: 400 };
  const draw = (from: { x: number; y: number }, to: { x: number; y: number }, style = {}) =>
    calloutKind.fromDrag("c", from, to, style, capture)!;

  it("a drag right and down puts the box's top-left corner at the release, extending right and down", () => {
    const a = draw({ x: 100, y: 100 }, { x: 160, y: 140 });
    expect(a).toMatchObject({ x: 170, y: 150, width: 240, minHeight: DEFAULT_CALLOUT_MIN_HEIGHT }); // the text box: padding 10 inside the speech box corner (160, 140)
    expect(a.tip).toEqual({ x: -70, y: -50 }); // the press, relative to the text box
  });

  it("works in every direction: the speech box is on the side of the release away from the press", () => {
    // Left and down: the top-right corner of the speech box is at the release (300, 160).
    const leftDown = draw({ x: 360, y: 100 }, { x: 300, y: 160 });
    expect(leftDown).toMatchObject({ x: 300 - 10 - 240, y: 170 });
    expect(leftDown.tip).toEqual({ x: 360 - leftDown.x, y: 100 - leftDown.y });
    // Right and up: the bottom-left corner is at the release (200, 100).
    const rightUp = draw({ x: 150, y: 160 }, { x: 200, y: 100 });
    expect(rightUp).toMatchObject({ x: 210, y: 100 - 10 - DEFAULT_CALLOUT_MIN_HEIGHT });
    // Left and up: the bottom-right corner.
    const leftUp = draw({ x: 500, y: 300 }, { x: 450, y: 250 });
    expect(leftUp).toMatchObject({ x: 450 - 10 - 240, y: 250 - 10 - DEFAULT_CALLOUT_MIN_HEIGHT });
    expect(leftUp.tip).toEqual({ x: 500 - leftUp.x, y: 300 - leftUp.y });
  });

  it("the tail is as long as the drag, whatever its length or angle (the tip is the press point)", () => {
    const short = draw({ x: 100, y: 100 }, { x: 110, y: 104 });
    const long = draw({ x: 100, y: 100 }, { x: 300, y: 250 });
    expect({ x: short.x + short.tip!.x, y: short.y + short.tip!.y }).toEqual({ x: 100, y: 100 });
    expect({ x: long.x + long.tip!.x, y: long.y + long.tip!.y }).toEqual({ x: 100, y: 100 });
    expect(long).toMatchObject({ x: 310, y: 260, width: 240 });
  });

  it("keeps the release and the box inside the visible area", () => {
    const farRight = draw({ x: 500, y: 100 }, { x: 700, y: 160 });
    expect(farRight.x + farRight.width + 10).toBeLessThanOrEqual(600);
    expect(farRight.x + farRight.tip!.x).toBe(500); // the tip stays where it was pressed
    const farDown = draw({ x: 100, y: 300 }, { x: 160, y: 500 });
    expect(farDown.y + DEFAULT_CALLOUT_MIN_HEIGHT + 10).toBeLessThanOrEqual(400);
    const inShiftedArea = calloutKind.fromDrag("c", { x: -40, y: 10 }, { x: -300, y: 60 }, {}, { x: -100, y: 0, width: 500, height: 300 })!;
    expect(inShiftedArea.x).toBeGreaterThanOrEqual(-100);
    const narrowArea = calloutKind.fromDrag("c", { x: 10, y: 10 }, { x: 50, y: 60 }, {}, { width: 150, height: 300 })!;
    expect(narrowArea.width).toBe(130); // the default width does not outgrow a small area
  });

  it("keeps a plain click as a default box at the click with no tip (the default tail below)", () => {
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
