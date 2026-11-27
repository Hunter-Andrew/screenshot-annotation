import { describe, expect, it } from "vitest";
import { CANVAS_MARGIN, DEFAULT_IMAGE_SETTINGS, inRange, OUTSIDE_DARKNESS, sanitizeImageSettings, TEXT_MAX_HEIGHT_RATIO } from "./imageSettings";

describe("sanitizeImageSettings", () => {
  it("gives the documented defaults for nothing", () => {
    expect(sanitizeImageSettings(undefined)).toEqual({
      background: "transparent",
      checkerboard: "light",
      canvasMargin: 16,
      cropMargin: 150,
      darkBackground: "#191919",
      outsideDarkness: 95,
      showOutsideDefault: true,
      libraryStripCollapsed: false,
      textAutoWiden: true,
      textMaxHeightRatio: 2,
      textBoxMinWidth: 240,
    });
    expect(sanitizeImageSettings({})).toEqual(DEFAULT_IMAGE_SETTINGS);
  });

  it("keeps valid values, clamps numbers into their range, and defaults anything that is not a whole number", () => {
    const value = sanitizeImageSettings({ background: "white", checkerboard: "dark", canvasMargin: 3, outsideDarkness: "x", showOutsideDefault: false });
    expect(value).toEqual({ background: "white", checkerboard: "dark", canvasMargin: 3, cropMargin: 150, darkBackground: "#191919", outsideDarkness: 95, showOutsideDefault: false, libraryStripCollapsed: false, textAutoWiden: true, textMaxHeightRatio: 2, textBoxMinWidth: 240 });
    expect(sanitizeImageSettings({ canvasMargin: 1.5, outsideDarkness: 100 })).toMatchObject({ canvasMargin: 16, outsideDarkness: 99.9 });
  });

  it("the margins reach 0, and the crop margin 400; the dark background must be #RRGGBB (lower-cased) or is the default", () => {
    expect(sanitizeImageSettings({ canvasMargin: 0, cropMargin: 400 })).toMatchObject({ canvasMargin: 0, cropMargin: 400 });
    expect(sanitizeImageSettings({ canvasMargin: -5, cropMargin: 999 })).toMatchObject({ canvasMargin: 0, cropMargin: 400 });
    expect(sanitizeImageSettings({ canvasMargin: 48 }).canvasMargin).toBe(48); // a margin saved under the old default stays as saved
    expect(sanitizeImageSettings({ darkBackground: "#ABCDEF" }).darkBackground).toBe("#abcdef");
    for (const bad of ["abcdef", "#abc", "#abcdeg", 5, null]) expect(sanitizeImageSettings({ darkBackground: bad }).darkBackground).toBe("#191919");
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

describe("the text box widening settings", () => {
  it("widening is on by default, and only a boolean turns it off", () => {
    expect(sanitizeImageSettings({}).textAutoWiden).toBe(true);
    expect(sanitizeImageSettings({ textAutoWiden: false }).textAutoWiden).toBe(false);
    expect(sanitizeImageSettings({ textAutoWiden: "no" }).textAutoWiden).toBe(true);
  });

  it("the ratio runs from 0.5 to 20 in tenths, 2 by default", () => {
    expect(sanitizeImageSettings({ textMaxHeightRatio: 7 }).textMaxHeightRatio).toBe(7);
    expect(sanitizeImageSettings({ textMaxHeightRatio: 0.5 }).textMaxHeightRatio).toBe(0.5);
    expect(sanitizeImageSettings({ textMaxHeightRatio: 1.26 }).textMaxHeightRatio).toBe(1.3);
    expect(sanitizeImageSettings({ textMaxHeightRatio: 0.1 }).textMaxHeightRatio).toBe(0.5);
    expect(sanitizeImageSettings({ textMaxHeightRatio: 99 }).textMaxHeightRatio).toBe(20);
    for (const bad of ["x", null, Number.NaN]) expect(sanitizeImageSettings({ textMaxHeightRatio: bad }).textMaxHeightRatio).toBe(2);
    expect(inRange(TEXT_MAX_HEIGHT_RATIO, 1.5)).toBe(true);
    expect(inRange(TEXT_MAX_HEIGHT_RATIO, 1.55)).toBe(false);
    expect(inRange(TEXT_MAX_HEIGHT_RATIO, 0.4)).toBe(false);
  });

});
