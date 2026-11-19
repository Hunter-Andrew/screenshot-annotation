import { describe, expect, it } from "vitest";
import { hexToRgba, hotTint, laserFor, laserStyles, layerExtents, POINTER_WINDOW_SIZE, RIPPLE, rippleStyle } from "./pointerStyle";

describe("Laser pointer size table (ticket 40 decisions 5 and 14, look C)", () => {
  it("keeps the core diameter at 10, 14 and 20 px for Small, Medium and Large", () => {
    expect(laserFor("small").core).toBe(10);
    expect(laserFor("medium").core).toBe(14);
    expect(laserFor("large").core).toBe(20);
  });

  it("is the prototype's look C at Medium (k = 1): haze 70, ring 36 with a 1.5 border, hot core 8 with a 6 blur and 2 spread glow", () => {
    expect(laserFor("medium")).toEqual({
      core: 14,
      haze: 70,
      ring: { diameter: 36, border: 1.5 },
      hot: { diameter: 8, blur: 6, spread: 2 },
    });
  });

  it("scales every layer with core / 14 for Small and keeps Large's haze at 90 px with the ring in proportion", () => {
    const small = laserFor("small");
    expect(small.haze).toBeCloseTo(50, 5);
    expect(small.ring.diameter).toBeCloseTo(25.71, 2);
    expect(small.ring.border).toBeCloseTo(1.07, 2);
    expect(small.hot.diameter).toBeCloseTo(5.71, 2);
    expect(small.hot.blur).toBeCloseTo(4.29, 2);
    expect(small.hot.spread).toBeCloseTo(1.43, 2);

    const large = laserFor("large");
    expect(large.haze).toBe(90);
    expect(large.ring.diameter).toBeCloseTo(46.29, 2);
    expect(large.ring.border).toBeCloseTo(2.14, 2);
    expect(large.hot.diameter).toBeCloseTo(11.43, 2);
  });

  it("fits every layer, the glow around the hot core and the ripple inside the 96 px window at every size", () => {
    for (const size of ["small", "medium", "large"] as const) {
      const l = laserFor(size);
      expect(l.haze).toBeLessThanOrEqual(POINTER_WINDOW_SIZE);
      expect(l.ring.diameter).toBeLessThanOrEqual(POINTER_WINDOW_SIZE);
      expect(l.hot.diameter + 2 * (l.hot.blur + l.hot.spread)).toBeLessThanOrEqual(POINTER_WINDOW_SIZE);
      expect(layerExtents(size)).toBeLessThanOrEqual(POINTER_WINDOW_SIZE);
    }
    expect(RIPPLE.maxDiameter).toBeLessThanOrEqual(POINTER_WINDOW_SIZE);
  });

  it("grows from Small to Large", () => {
    expect(laserFor("small").core).toBeLessThan(laserFor("medium").core);
    expect(laserFor("medium").core).toBeLessThan(laserFor("large").core);
    expect(laserFor("small").haze).toBeLessThan(laserFor("medium").haze);
    expect(laserFor("medium").haze).toBeLessThan(laserFor("large").haze);
  });
});

describe("hexToRgba", () => {
  it("turns #rrggbb and an opacity into a CSS colour", () => {
    expect(hexToRgba("#e02424", 0.7)).toBe("rgba(224, 36, 36, 0.7)");
    expect(hexToRgba("#FFFFFF", 0.3)).toBe("rgba(255, 255, 255, 0.3)");
  });
  it("falls back to red for anything that is not #rrggbb", () => {
    expect(hexToRgba("nope", 0.5)).toBe("rgba(224, 36, 36, 0.5)");
  });
});

describe("hotTint", () => {
  it("is the colour 82% of the way to white, for the hot centre", () => {
    expect(hotTint("#e02424")).toBe("rgb(249, 216, 216)");
    expect(hotTint("#000000")).toBe("rgb(209, 209, 209)");
  });
  it("falls back to the tint of red for anything that is not #rrggbb", () => {
    expect(hotTint("nope")).toBe("rgb(249, 216, 216)");
  });
});

describe("laserStyles", () => {
  const medium = laserStyles({ color: "#2563eb", size: "medium" });

  it("draws a wide haze that fades from 50% at the centre to nothing at 72%", () => {
    expect(medium.haze.width).toBe(70);
    expect(medium.haze.height).toBe(70);
    expect(medium.haze.borderRadius).toBe("50%");
    expect(medium.haze.background).toBe(
      "radial-gradient(circle, rgba(37, 99, 235, 0.5) 0%, rgba(37, 99, 235, 0.22) 40%, rgba(37, 99, 235, 0) 72%)",
    );
  });

  it("draws one thin ring at 55% in the colour", () => {
    expect(medium.ring.width).toBe(36);
    expect(medium.ring.boxSizing).toBe("border-box");
    expect(medium.ring.border).toBe("1.5px solid rgba(37, 99, 235, 0.55)");
  });

  it("draws a small hot core from the pale tint to the full colour with a glow", () => {
    expect(medium.hot.width).toBe(8);
    expect(medium.hot.background).toBe("radial-gradient(circle, rgb(216, 227, 251) 0%, rgba(37, 99, 235, 1) 80%)");
    expect(medium.hot.boxShadow).toBe("0 0 6px 2px rgba(37, 99, 235, 0.8)");
  });

  it("clamps Large's haze so its gradient stays inside the window", () => {
    expect(laserStyles({ color: "#2563eb", size: "large" }).haze.width).toBe(90);
  });
});

describe("rippleStyle", () => {
  it("is a ring in the pointer colour that starts at the core size", () => {
    const style = rippleStyle({ color: "#16a34a", size: "large" });
    expect(style.borderColor).toBe("#16a34a");
    expect(style["--ripple-from"]).toBe("20px");
    expect(style["--ripple-to"]).toBe("70px");
    expect(style.animationDuration).toBe("400ms");
  });
});
