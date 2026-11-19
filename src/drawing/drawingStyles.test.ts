import { describe, expect, it } from "vitest";
import { DRAWING_HIGHLIGHTER_OPACITY, drawingHighlighterOpacityPercent, readDrawingStyles } from "./drawingStyles";

const RED = { color: "#e02424", width: 4 };

describe("the style each drawing tool uses", () => {
  it("falls back to the editor's defaults when nothing is stored", () => {
    const s = readDrawingStyles({});
    expect(s.arrow).toMatchObject({ stroke: RED, arrowheads: { ends: "end" } });
    expect(s.rect).toMatchObject({ stroke: RED, fill: { mode: "none" } });
    expect(s.pen).toMatchObject({ stroke: RED });
    expect(s.highlight).toMatchObject({ stroke: { color: "#ffff00", width: 20 }, opacity: { value: 0.2 } });
  });

  it("uses what the editor stored for each tool", () => {
    const s = readDrawingStyles({
      arrow: { stroke: { color: "#00ff00", width: 7 }, arrowheads: { ends: "both" } },
      highlight: { stroke: { color: "#ff00ff", width: 12 }, opacity: { value: 0.4 } },
    });
    expect(s.arrow.stroke).toEqual({ color: "#00ff00", width: 7 });
    expect(s.arrow.arrowheads).toEqual({ ends: "both" });
    expect(s.highlight.stroke).toEqual({ color: "#ff00ff", width: 12 });
    expect(s.highlight.opacity).toEqual({ value: 0.2 });
    expect(s.pen.stroke).toEqual(RED);
  });

  it("falls back group by group: a bad group does not lose the good one", () => {
    const s = readDrawingStyles({ rect: { stroke: { color: "red", width: 4 }, fill: { mode: "solid", color: "#123456", opacity: 1 } } });
    expect(s.rect.stroke).toEqual(RED);
    expect(s.rect.fill).toEqual({ mode: "solid", color: "#123456", opacity: 1 });
  });

  it("falls back for settings that are missing, malformed or out of range", () => {
    for (const raw of [null, undefined, 5, "x", [], { pen: 3 }, { pen: { stroke: { color: "#ffffff", width: 99 } } }]) {
      expect(readDrawingStyles(raw).pen.stroke).toEqual(RED);
    }
  });

  it("never reads the Pen's Eraser mode into the drawing style", () => {
    const s = readDrawingStyles({ pen: { stroke: { color: "#010101", width: 3 }, eraser: { mode: "eraser", size: 20 } } });
    expect(s.pen.eraser).toBeUndefined();
    expect(s.pen.stroke).toEqual({ color: "#010101", width: 3 });
  });
});

describe("the Highlighter's opacity in Drawing mode", () => {
  const editorStyle = { highlight: { stroke: { color: "#ff00ff", width: 12 }, opacity: { value: 0.8 } } };

  it("never takes the editor's saved opacity (the editor multiplies, a transparent overlay cannot), but keeps its colour and thickness", () => {
    const s = readDrawingStyles(editorStyle);
    expect(s.highlight.opacity).toEqual({ value: 0.2 });
    expect(s.highlight.stroke).toEqual({ color: "#ff00ff", width: 12 });
  });

  it("uses the Drawing mode setting, in percent", () => {
    expect(readDrawingStyles(editorStyle, 35).highlight.opacity).toEqual({ value: 0.35 });
    expect(readDrawingStyles({}, 60).highlight.opacity).toEqual({ value: 0.6 });
  });

  it("leaves the other tools' opacity alone", () => {
    const s = readDrawingStyles({ rect: { stroke: { color: "#123456", width: 3 }, fill: { mode: "semi", color: "#654321", opacity: 0.5 } } }, 40);
    expect(s.rect.fill).toEqual({ mode: "semi", color: "#654321", opacity: 0.5 });
  });

  it("is 5 to 60 percent, 20 by default", () => {
    expect(DRAWING_HIGHLIGHTER_OPACITY).toEqual({ min: 5, max: 60, default: 20 });
  });

  it("clamps into range and falls back to 20 for anything that is not a number", () => {
    expect(drawingHighlighterOpacityPercent(1)).toBe(5);
    expect(drawingHighlighterOpacityPercent(99)).toBe(60);
    expect(drawingHighlighterOpacityPercent(37)).toBe(37);
    for (const bad of [undefined, null, "30", NaN, Infinity, {}, []]) expect(drawingHighlighterOpacityPercent(bad)).toBe(20);
    expect(readDrawingStyles({}, 500).highlight.opacity).toEqual({ value: 0.6 });
    expect(readDrawingStyles({}, "x").highlight.opacity).toEqual({ value: 0.2 });
  });
});
