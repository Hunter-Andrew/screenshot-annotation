import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_SETTINGS, sanitizeImageSettings } from "./imageSettings";

describe("sanitizeImageSettings", () => {
  it("gives the documented defaults for nothing", () => {
    expect(sanitizeImageSettings(undefined)).toEqual({
      background: "transparent",
      checkerboard: "light",
      calloutTailPercent: 20,
      canvasMargin: 48,
      outsideDarkness: 60,
      showOutsideDefault: true,
    });
    expect(sanitizeImageSettings({})).toEqual(DEFAULT_IMAGE_SETTINGS);
  });

  it("keeps valid values, clamps numbers into their range, and defaults anything that is not a whole number", () => {
    const value = sanitizeImageSettings({ background: "white", checkerboard: "dark", calloutTailPercent: 99, canvasMargin: 3, outsideDarkness: "x", showOutsideDefault: false });
    expect(value).toEqual({ background: "white", checkerboard: "dark", calloutTailPercent: 50, canvasMargin: 16, outsideDarkness: 60, showOutsideDefault: false });
    expect(sanitizeImageSettings({ canvasMargin: 1.5, outsideDarkness: 100 })).toMatchObject({ canvasMargin: 48, outsideDarkness: 95 });
  });
});
