import { describe, expect, it } from "vitest";
import { CANVAS_MARGIN, DEFAULT_IMAGE_SETTINGS, inRange, OUTSIDE_DARKNESS, sanitizeImageSettings } from "./imageSettings";

describe("sanitizeImageSettings", () => {
  it("gives the documented defaults for nothing", () => {
    expect(sanitizeImageSettings(undefined)).toEqual({
      background: "transparent",
      checkerboard: "light",
      canvasMargin: 48,
      outsideDarkness: 95,
      showOutsideDefault: true,
    });
    expect(sanitizeImageSettings({})).toEqual(DEFAULT_IMAGE_SETTINGS);
  });

  it("keeps valid values, clamps numbers into their range, and defaults anything that is not a whole number", () => {
    const value = sanitizeImageSettings({ background: "white", checkerboard: "dark", canvasMargin: 3, outsideDarkness: "x", showOutsideDefault: false });
    expect(value).toEqual({ background: "white", checkerboard: "dark", canvasMargin: 16, outsideDarkness: 95, showOutsideDefault: false });
    expect(sanitizeImageSettings({ canvasMargin: 1.5, outsideDarkness: 100 })).toMatchObject({ canvasMargin: 48, outsideDarkness: 99.9 });
  });

  it("the outside darkness takes one decimal place up to 99.9; a stored whole number such as 60 stays as stored", () => {
    expect(sanitizeImageSettings({ outsideDarkness: 60 }).outsideDarkness).toBe(60);
    expect(sanitizeImageSettings({ outsideDarkness: 72.5 }).outsideDarkness).toBe(72.5);
    expect(sanitizeImageSettings({ outsideDarkness: 99.9 }).outsideDarkness).toBe(99.9);
    expect(sanitizeImageSettings({ outsideDarkness: 72.54 }).outsideDarkness).toBe(72.5);
    expect(sanitizeImageSettings({ outsideDarkness: 99.95 }).outsideDarkness).toBe(99.9);
    expect(sanitizeImageSettings({ outsideDarkness: -1 }).outsideDarkness).toBe(0);
    expect(sanitizeImageSettings({ outsideDarkness: Number.NaN }).outsideDarkness).toBe(95);
    expect(OUTSIDE_DARKNESS).toMatchObject({ min: 0, max: 99.9, default: 95 });
  });

  it("inRange accepts tenths for the darkness and refuses a value past 99.9 or with more decimals", () => {
    expect(inRange(OUTSIDE_DARKNESS, 99.9)).toBe(true);
    expect(inRange(OUTSIDE_DARKNESS, 0.1)).toBe(true);
    expect(inRange(OUTSIDE_DARKNESS, 100)).toBe(false);
    expect(inRange(OUTSIDE_DARKNESS, 50.05)).toBe(false);
    expect(inRange(CANVAS_MARGIN, 48.5)).toBe(false);
  });
});
