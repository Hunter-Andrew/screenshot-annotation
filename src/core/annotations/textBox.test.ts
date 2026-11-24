import { describe, expect, it } from "vitest";
import { dragTextBox, HANDLES, MIN_BOX_WIDTH, widthForRatio } from "./textBox";

// A 200 x 60 box at (100, 50) with a 4 px outline: the visible box is 204 x 64, so its edges are at
// x 100..304 and y 50..114.
const box = { left: 100, top: 50, width: 200, height: 60 };
const PAD = 4;

describe("dragTextBox", () => {
  it("the right handle sets the width so the visible edge follows the pointer, and leaves the rest", () => {
    const d = dragTextBox(box, PAD, HANDLES.mr, { x: 404, y: 999 });
    expect(d).toEqual({ left: 100, width: 300, minHeight: undefined, keepBottom: false });
  });

  it("the left handle moves the left edge and keeps the right edge where it is", () => {
    const d = dragTextBox(box, PAD, HANDLES.ml, { x: 60, y: 0 });
    expect(d.left).toBe(60);
    expect(d.left + d.width + PAD).toBe(304);
    expect(d.minHeight).toBeUndefined();
  });

  it("the bottom handle sets the minimum height to the dragged height", () => {
    const d = dragTextBox(box, PAD, HANDLES.mb, { x: 0, y: 214 });
    expect(d.minHeight).toBe(160);
    expect(d).toMatchObject({ left: 100, width: 200, keepBottom: false });
  });

  it("the top handle sets the height from the fixed bottom edge and asks for the bottom to be kept", () => {
    const d = dragTextBox(box, PAD, HANDLES.mt, { x: 0, y: 14 });
    // Visible height 114 - 14 = 100, of which the outline takes 4.
    expect(d.minHeight).toBe(96);
    expect(d.keepBottom).toBe(true);
    expect(d).toMatchObject({ left: 100, width: 200 });
  });

  it("a corner does both axes at once", () => {
    const br = dragTextBox(box, PAD, HANDLES.br, { x: 504, y: 214 });
    expect(br).toMatchObject({ left: 100, width: 400, minHeight: 160, keepBottom: false });
    const tl = dragTextBox(box, PAD, HANDLES.tl, { x: 40, y: 10 });
    expect(tl.left).toBe(40);
    expect(tl.left + tl.width + PAD).toBe(304);
    expect(tl.minHeight).toBe(100);
    expect(tl.keepBottom).toBe(true);
  });

  it("never flips: past the opposite edge the box stops at the minimum width", () => {
    expect(dragTextBox(box, PAD, HANDLES.mr, { x: 20, y: 0 }).width).toBe(MIN_BOX_WIDTH);
    const left = dragTextBox(box, PAD, HANDLES.ml, { x: 900, y: 0 });
    expect(left.width).toBe(MIN_BOX_WIDTH);
    expect(left.left + left.width + PAD).toBe(304);
  });

  it("dragging the height past the opposite edge asks for no minimum rather than a negative one", () => {
    expect(dragTextBox(box, PAD, HANDLES.mb, { x: 0, y: -100 }).minHeight).toBe(0);
    expect(dragTextBox(box, PAD, HANDLES.mt, { x: 0, y: 900 }).minHeight).toBe(0);
  });

  it("works with no outline", () => {
    expect(dragTextBox(box, 0, HANDLES.mr, { x: 400, y: 0 }).width).toBe(300);
    expect(dragTextBox(box, 0, HANDLES.mb, { x: 0, y: 200 }).minHeight).toBe(150);
  });

  it("has the eight handles and no others", () => {
    expect(Object.keys(HANDLES).sort()).toEqual(["bl", "br", "mb", "ml", "mr", "mt", "tl", "tr"]);
  });
});

describe("widthForRatio", () => {
  // A stand-in for laying text out: `area` square pixels of text wrapped at a width, each line 10 px tall.
  const linesAt = (area: number) => (w: number) => Math.ceil(area / w / 10) * 10;

  it("keeps a width whose lines are not too tall for it", () => {
    expect(widthForRatio(100, 4, linesAt(10000), 8192)).toBe(100); // 100 px tall at 100 wide: 1x
  });

  it("keeps a width that is exactly at the ratio", () => {
    expect(widthForRatio(50, 4, () => 200, 8192)).toBe(50);
  });

  it("widens to the narrowest width that is within the ratio", () => {
    const lines = linesAt(10000);
    const width = widthForRatio(10, 4, lines, 8192);
    expect(lines(width)).toBeLessThanOrEqual(4 * width);
    expect(lines(width - 1)).toBeGreaterThan(4 * (width - 1));
    expect(width).toBeGreaterThan(10);
  });

  it("never narrows a box", () => {
    expect(widthForRatio(300, 4, () => 10, 8192)).toBe(300);
  });

  it("leaves text alone when no width would make its lines shorter (its own line breaks make it tall)", () => {
    expect(widthForRatio(10, 4, () => 1e9, 500)).toBe(10);
    expect(widthForRatio(150, 4, () => 760, 8192)).toBe(150); // twenty short lines in a narrow box: widening would not help
  });

  it("widens only as far as it helps, even when the unwrapped text is still taller than the ratio", () => {
    // Wrapped text of 8 explicit lines (80 px) that wraps further at under 60 wide.
    const lines = (w: number) => (w >= 60 ? 80 : 400);
    expect(widthForRatio(20, 1, lines, 8192)).toBe(60);
  });

  it("does nothing when the ratio is not positive", () => {
    expect(widthForRatio(10, 0, () => 1e9, 8192)).toBe(10);
  });
});
