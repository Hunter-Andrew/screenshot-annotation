import { describe, expect, it } from "vitest";
import { dotStyle, glowFor, hexToRgba, POINTER_WINDOW_SIZE, RIPPLE, rippleStyle } from "./pointerStyle";

describe("pointer dot size and glow table (ticket 40 decision 5)", () => {
  it("has the core dot at 10, 14 and 20 px for Small, Medium and Large", () => {
    expect(glowFor("small").core).toBe(10);
    expect(glowFor("medium").core).toBe(14);
    expect(glowFor("large").core).toBe(20);
  });

  it("keeps the prototype's two-layer glow for Medium and scales it for the others", () => {
    expect(glowFor("medium")).toEqual({
      core: 14,
      inner: { blur: 10, spread: 4, opacity: 0.7 },
      outer: { blur: 24, spread: 10, opacity: 0.3 },
    });
    expect(glowFor("small")).toEqual({
      core: 10,
      inner: { blur: 7, spread: 3, opacity: 0.7 },
      outer: { blur: 17, spread: 7, opacity: 0.3 },
    });
    expect(glowFor("large")).toEqual({
      core: 20,
      inner: { blur: 14, spread: 6, opacity: 0.7 },
      outer: { blur: 26, spread: 10, opacity: 0.3 },
    });
  });

  it("fits every glow, and the ripple, inside the 96 px window around the dot", () => {
    for (const size of ["small", "medium", "large"] as const) {
      const g = glowFor(size);
      expect(g.core / 2 + g.outer.spread + g.outer.blur).toBeLessThanOrEqual(POINTER_WINDOW_SIZE / 2);
    }
    expect(RIPPLE.maxDiameter).toBeLessThanOrEqual(POINTER_WINDOW_SIZE);
  });

  it("grows from Small to Large", () => {
    expect(glowFor("small").core).toBeLessThan(glowFor("medium").core);
    expect(glowFor("medium").core).toBeLessThan(glowFor("large").core);
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

describe("dotStyle", () => {
  it("draws a round core in the colour with the two glow layers in the same colour", () => {
    const style = dotStyle({ color: "#2563eb", size: "medium" });
    expect(style.width).toBe(14);
    expect(style.height).toBe(14);
    expect(style.borderRadius).toBe("50%");
    expect(style.background).toBe("#2563eb");
    expect(style.boxShadow).toBe("0 0 10px 4px rgba(37, 99, 235, 0.7), 0 0 24px 10px rgba(37, 99, 235, 0.3)");
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
