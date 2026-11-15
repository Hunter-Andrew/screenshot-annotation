import { describe, expect, it } from "vitest";
import { dragRect, isClick, magnifierPlacement, sizeLabel, toPhysicalRegion, windowAt } from "./selection";

const viewport = { width: 1000, height: 500 };

describe("dragRect (the region follows the pointer but stops at the starting monitor)", () => {
  it("is the rectangle between the press and the pointer, whichever way you drag", () => {
    expect(dragRect({ x: 100, y: 80 }, { x: 40, y: 30 }, viewport)).toEqual({
      x: 40,
      y: 30,
      width: 60,
      height: 50,
    });
  });

  it("clamps at every edge of the monitor when the pointer leaves it", () => {
    // Pointer capture keeps reporting positions after the pointer crossed onto a neighbour monitor:
    // left of or above this monitor is negative, right of or below it is past the size.
    expect(dragRect({ x: 900, y: 450 }, { x: 1300, y: 700 }, viewport)).toEqual({
      x: 900,
      y: 450,
      width: 100,
      height: 50,
    });
    expect(dragRect({ x: 100, y: 50 }, { x: -250, y: -10 }, viewport)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });
});

describe("toPhysicalRegion (CSS pixels of the overlay -> native pixels of the monitor)", () => {
  it("scales by physical size over viewport size, so a 150% monitor yields native pixels", () => {
    // 1280x720 CSS viewport on a 1920x1080 physical monitor (150%).
    const rect = { x: 100, y: 40, width: 200, height: 80 };
    expect(toPhysicalRegion(rect, { width: 1280, height: 720 }, { width: 1920, height: 1080 })).toEqual({
      x: 150,
      y: 60,
      width: 300,
      height: 120,
    });
  });

  it("rounds edges (not sizes) so neighbouring pixels are never skipped or duplicated", () => {
    // scale 1.5: left edge 1 -> 1.5 -> 2, right edge 2 -> 3
    const region = toPhysicalRegion(
      { x: 1, y: 1, width: 1, height: 1 },
      { width: 100, height: 100 },
      { width: 150, height: 150 },
    );
    expect(region).toEqual({ x: 2, y: 2, width: 1, height: 1 });
  });

  it("never exceeds the monitor", () => {
    const region = toPhysicalRegion({ x: 0, y: 0, width: 1000, height: 500 }, viewport, {
      width: 2000,
      height: 1000,
    });
    expect(region).toEqual({ x: 0, y: 0, width: 2000, height: 1000 });
  });

  it("is null for a click (nothing dragged), so releasing without a drag captures nothing", () => {
    expect(toPhysicalRegion({ x: 5, y: 5, width: 0, height: 0 }, viewport, viewport)).toBeNull();
    expect(toPhysicalRegion({ x: 5, y: 5, width: 40, height: 0 }, viewport, viewport)).toBeNull();
  });
});

describe("sizeLabel", () => {
  it("shows the native pixel size", () => {
    expect(sizeLabel({ width: 300, height: 120 })).toBe("300 × 120");
  });
});

describe("magnifierPlacement", () => {
  const box = { width: 120, height: 120 };
  it("sits down and to the right of the cursor", () => {
    expect(magnifierPlacement({ x: 100, y: 100 }, viewport, box)).toEqual({ x: 120, y: 120 });
  });
  it("flips to the other side near the right and bottom edges", () => {
    expect(magnifierPlacement({ x: 950, y: 480 }, viewport, box)).toEqual({ x: 810, y: 340 });
  });
});

describe("windowAt (the window under the pointer, by z-order)", () => {
  // Native pixels, local to the monitor, topmost window first: a dialog over a big window over a
  // window that hangs off the left edge (already clipped to the monitor by the platform).
  const windows = [
    { x: 400, y: 300, width: 200, height: 100 },
    { x: 100, y: 100, width: 800, height: 600 },
    { x: 0, y: 50, width: 300, height: 900 },
  ];

  it("picks the topmost window containing the point, so a dialog wins over what is behind it", () => {
    expect(windowAt(windows, { x: 450, y: 350 })).toBe(0);
    expect(windowAt(windows, { x: 700, y: 650 })).toBe(1);
    expect(windowAt(windows, { x: 50, y: 800 })).toBe(2);
  });

  it("where windows overlap, the upper one wins", () => {
    expect(windowAt(windows, { x: 200, y: 200 })).toBe(1); // inside windows 1 and 2
  });

  it("includes a window's top-left pixel and excludes its far edge", () => {
    expect(windowAt(windows, { x: 400, y: 300 })).toBe(0);
    expect(windowAt(windows, { x: 599, y: 399 })).toBe(0);
    expect(windowAt(windows, { x: 600, y: 399 })).toBe(1);
  });

  it("is null over the bare desktop", () => {
    expect(windowAt(windows, { x: 950, y: 10 })).toBeNull();
    expect(windowAt([], { x: 1, y: 1 })).toBeNull();
  });
});

describe("isClick (a press and release that barely moved is a click, not a region)", () => {
  it("tolerates a few pixels of jitter", () => {
    expect(isClick({ x: 100, y: 100 }, { x: 102, y: 99 })).toBe(true);
    expect(isClick({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });
  it("is a drag once the pointer has moved noticeably", () => {
    expect(isClick({ x: 100, y: 100 }, { x: 108, y: 100 })).toBe(false);
    expect(isClick({ x: 100, y: 100 }, { x: 100, y: 90 })).toBe(false);
  });
});
