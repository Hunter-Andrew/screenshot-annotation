import { describe, expect, it } from "vitest";
import type { Annotation } from "../core/annotation";
import { paintDrawing } from "./paint";

/** A canvas context that only writes down what it was asked to do. */
function recorder() {
  const calls: string[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get: (_t, name: string) => (name in props ? props[name] : (...args: unknown[]) => void calls.push(`${name}(${args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : a)).join(",")})`)),
      set: (_t, name: string, value) => {
        props[name] = value;
        calls.push(`${name}=${value}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const stroke = { color: "#e02424", width: 4 };

describe("painting a drawing on the overlay's canvas", () => {
  it("paints a rectangle's outline in its colour and thickness, with its fill when it has one", () => {
    const { ctx, calls } = recorder();
    const rect: Annotation = { id: "r", type: "rect", x: 10, y: 20, width: 100, height: 50, stroke, fill: { mode: "semi", color: "#00ff00", opacity: 0.5 } };
    paintDrawing(ctx, rect);
    expect(calls).toContain("fillStyle=rgba(0, 255, 0, 0.5)");
    expect(calls).toContain("fillRect(10,20,100,50)");
    expect(calls).toContain("strokeStyle=#e02424");
    expect(calls).toContain("lineWidth=4");
    expect(calls).toContain("strokeRect(10,20,100,50)");
  });

  it("paints no fill for a rectangle without one", () => {
    const { ctx, calls } = recorder();
    paintDrawing(ctx, { id: "r", type: "rect", x: 0, y: 0, width: 9, height: 9, stroke, fill: { mode: "none", color: "#ffff00", opacity: 0.4 } });
    expect(calls.some((c) => c.startsWith("fillRect"))).toBe(false);
  });

  it("paints an arrow as a shaft and a filled head", () => {
    const { ctx, calls } = recorder();
    paintDrawing(ctx, { id: "a", type: "arrow", x1: 0, y1: 0, x2: 200, y2: 0, stroke, arrowheads: { ends: "end" } });
    expect(calls).toContain("moveTo(0,0)");
    expect(calls.filter((c) => c === "fill()")).toHaveLength(1);
    expect(calls).toContain("stroke()");
  });

  it("paints a pen stroke opaque and a highlighter stroke translucent", () => {
    const points = [{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: 80, y: 0 }];
    const pen = recorder();
    paintDrawing(pen.ctx, { id: "p", type: "pen", points, stroke });
    expect(pen.calls).toContain("lineCap=round");
    expect(pen.calls.some((c) => c.startsWith("globalAlpha=") && c !== "globalAlpha=1")).toBe(false);
    const marker = recorder();
    paintDrawing(marker.ctx, { id: "h", type: "highlight", points, stroke: { color: "#ffff00", width: 20 }, opacity: { value: 0.4 } });
    expect(marker.calls).toContain("globalAlpha=0.4");
    expect(marker.calls.some((c) => c.startsWith("globalCompositeOperation="))).toBe(false);
  });

  it("paints a click with the pen as a dot", () => {
    const { ctx, calls } = recorder();
    paintDrawing(ctx, { id: "p", type: "pen", points: [{ x: 5, y: 6 }, { x: 5, y: 6 }], stroke });
    expect(calls).toContain("arc(5,6,2,0,6.28)");
  });

  it("leaves the context as it found it (save and restore pair up)", () => {
    const { ctx, calls } = recorder();
    paintDrawing(ctx, { id: "p", type: "pen", points: [{ x: 0, y: 0 }, { x: 9, y: 9 }], stroke });
    expect(calls.filter((c) => c === "save()")).toHaveLength(calls.filter((c) => c === "restore()").length);
  });

  it("skips a type Drawing mode does not draw", () => {
    const { ctx, calls } = recorder();
    paintDrawing(ctx, { id: "l", type: "line", x1: 0, y1: 0, x2: 9, y2: 9, stroke } as Annotation);
    expect(calls).toEqual([]);
  });
});
