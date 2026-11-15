// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FIT, effectiveScale, fitScale, scrollAfterZoom, zoomStep } from "./view";

// The well is the grey area around the canvas; it keeps 16 px of padding on every side.
describe("fitScale: whole image visible, never enlarged", () => {
  it("fits a tall Capture by height, so there is nothing to scroll", () => {
    // 100 x 1000 in an 800 x 600 well: (600 - 2 * 16) / 1000
    expect(fitScale({ width: 100, height: 1000 }, { width: 800, height: 600 })).toBeCloseTo(0.568);
  });

  it("fits a wide Capture by width", () => {
    // 2000 x 500: (800 - 32) / 2000
    expect(fitScale({ width: 2000, height: 500 }, { width: 800, height: 600 })).toBeCloseTo(0.384);
  });

  it("shows a small Capture at 100%, not stretched", () => {
    expect(fitScale({ width: 64, height: 48 }, { width: 800, height: 600 })).toBe(1);
  });

  it("refits when the window is resized", () => {
    const image = { width: 100, height: 1000 };
    expect(fitScale(image, { width: 800, height: 900 })).toBeCloseTo(0.868);
    expect(fitScale(image, { width: 800, height: 300 })).toBeCloseTo(0.268);
  });

  it("falls back to 100% before the well has been laid out", () => {
    expect(fitScale({ width: 100, height: 1000 }, { width: 0, height: 0 })).toBe(1);
  });

  it("never collapses to nothing in a tiny window", () => {
    expect(fitScale({ width: 5000, height: 5000 }, { width: 40, height: 40 })).toBeGreaterThanOrEqual(0.05);
  });
});

describe("effectiveScale", () => {
  const image = { width: 100, height: 1000 };
  const well = { width: 800, height: 600 };

  it("follows the well in Fit mode", () => {
    expect(effectiveScale(FIT, image, well)).toBeCloseTo(0.568);
  });

  it("holds the chosen zoom whatever the well does", () => {
    expect(effectiveScale({ kind: "zoom", scale: 2 }, image, well)).toBe(2);
    expect(effectiveScale({ kind: "zoom", scale: 2 }, image, { width: 10, height: 10 })).toBe(2);
  });
});

describe("zoomStep", () => {
  it("steps along a ladder from wherever the view is, e.g. a fitted 56.8%", () => {
    expect(zoomStep(0.568, 1)).toBe(0.67);
    expect(zoomStep(0.568, -1)).toBe(0.5);
    expect(zoomStep(1, 1)).toBe(1.5);
    expect(zoomStep(1, -1)).toBe(0.75);
  });

  it("stops at the ends of the ladder", () => {
    expect(zoomStep(8, 1)).toBe(8);
    expect(zoomStep(0.1, -1)).toBe(0.1);
  });
});

describe("scrollAfterZoom: the point in the middle of the view stays in the middle", () => {
  const view = { width: 800, height: 600 };

  it("zooming in on a scrolled view keeps the centre point", () => {
    // Centre of the view is image point ((100 + 400 - 16) / 1, (50 + 300 - 16) / 1) = (484, 334).
    const next = scrollAfterZoom({
      image: { width: 4000, height: 3000 },
      view,
      scroll: { left: 100, top: 50 },
      from: 1,
      to: 2,
    });

    expect(next.left).toBeCloseTo(16 + 484 * 2 - 400);
    expect(next.top).toBeCloseTo(16 + 334 * 2 - 300);
  });

  it("zooming in from a centred (smaller than the view) image anchors on the image centre", () => {
    // 100 x 1000 at 0.568 is 56.8 x 568 plus padding: smaller than the view on the x axis only.
    const next = scrollAfterZoom({
      image: { width: 100, height: 1000 },
      view,
      scroll: { left: 0, top: 0 },
      from: 0.568,
      to: 2,
    });

    expect(next.left).toBe(0); // 200 px + padding still fits across: nothing to scroll sideways
    expect(next.top).toBeCloseTo(16 + 500 * 2 - 300);
  });

  it("never asks for a negative scroll", () => {
    const next = scrollAfterZoom({
      image: { width: 4000, height: 3000 },
      view,
      scroll: { left: 0, top: 0 },
      from: 2,
      to: 0.25,
    });

    expect(next).toEqual({ left: 0, top: 0 });
  });
});
