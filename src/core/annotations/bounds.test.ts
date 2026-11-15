// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strokeBounds } from "./bounds";

describe("strokeBounds", () => {
  it("is the box around the points, grown by half the thickness plus 1 px on every side", () => {
    expect(strokeBounds([{ x: 10, y: 20 }, { x: 50, y: 5 }, { x: 30, y: 40 }], 10)).toEqual({
      left: 4,
      top: -1,
      width: 52,
      height: 47,
    });
  });

  it("is a padded dot for a single point", () => {
    expect(strokeBounds([{ x: 7, y: 9 }], 2)).toEqual({ left: 5, top: 7, width: 4, height: 4 });
  });
});
