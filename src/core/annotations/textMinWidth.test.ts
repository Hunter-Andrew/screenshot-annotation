import { describe, expect, it } from "vitest";
import { minWidthAreaFromDrag, textKind } from "./text";

const capture = { width: 800, height: 600 };
const draw = (from: { x: number; y: number }, to: { x: number; y: number }, textMinWidth?: number) =>
  textKind.fromDrag("t", from, to, {}, capture, textMinWidth === undefined ? undefined : { textMinWidth })!;

describe("Text minimum width at placement", () => {
  it("a click gets the default width (240, like a placed Callout)", () => {
    expect(draw({ x: 50, y: 60 }, { x: 50, y: 60 }, 240).width).toBe(240);
  });

  it("widens a narrow drag to the minimum, keeping its left edge and its dragged height", () => {
    expect(draw({ x: 100, y: 100 }, { x: 160, y: 180 }, 240)).toMatchObject({ x: 100, y: 100, width: 240, minHeight: 80 });
  });

  it("a drag to the left keeps its right edge", () => {
    expect(draw({ x: 400, y: 100 }, { x: 340, y: 180 }, 240)).toMatchObject({ x: 160, width: 240 });
  });

  it("leaves a drag that is already wide enough alone", () => {
    expect(draw({ x: 100, y: 100 }, { x: 500, y: 180 }, 240).width).toBe(400);
  });

  it("with 0, or no option, there is no minimum: a narrow drag stays narrow, and a click is the default width", () => {
    expect(draw({ x: 100, y: 100 }, { x: 130, y: 180 }, 0).width).toBe(30);
    expect(draw({ x: 100, y: 100 }, { x: 130, y: 180 }).width).toBe(30);
    expect(draw({ x: 50, y: 60 }, { x: 50, y: 60 }, 0).width).toBe(240);
  });

  it("a bigger minimum widens a click too, and the box slides in to stay inside the visible area", () => {
    expect(draw({ x: 50, y: 60 }, { x: 50, y: 60 }, 400).width).toBe(400);
    expect(minWidthAreaFromDrag({ x: 700, y: 10 }, { x: 760, y: 90 }, capture, 240)).toMatchObject({ x: 560, width: 240 });
    expect(minWidthAreaFromDrag({ x: 10, y: 10 }, { x: 40, y: 90 }, { width: 150, height: 100 }, 240).width).toBe(150);
  });
});
