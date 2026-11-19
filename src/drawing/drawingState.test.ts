import { describe, expect, it } from "vitest";
import type { Annotation } from "../core/annotation";
import {
  clampToMonitor,
  clear,
  commit,
  DEFAULT_TOOL,
  DRAWING_TOOLS,
  drawingFromGesture,
  initialDrawingState,
  redo,
  selectTool,
  undo,
} from "./drawingState";
import { readDrawingStyles } from "./drawingStyles";

const styles = readDrawingStyles({});
const screen = { width: 1920, height: 1080 };
const arrow = (id: string): Annotation =>
  drawingFromGesture("arrow", id, [{ x: 10, y: 10 }, { x: 200, y: 100 }], styles, screen)!;

describe("tools", () => {
  it("offers Arrow, Rectangle, Pen and Highlighter, and starts on Arrow", () => {
    expect(DRAWING_TOOLS).toEqual(["arrow", "rect", "pen", "highlight"]);
    expect(DEFAULT_TOOL).toBe("arrow");
    expect(initialDrawingState().tool).toBe("arrow");
  });

  it("selecting a tool changes only the tool", () => {
    const s = commit(initialDrawingState(), arrow("a"));
    const next = selectTool(s, "pen");
    expect(next.tool).toBe("pen");
    expect(next.drawings).toEqual(s.drawings);
  });
});

describe("undo, redo and clear", () => {
  it("undo removes the last drawing and redo puts it back", () => {
    let s = commit(commit(initialDrawingState(), arrow("a")), arrow("b"));
    s = undo(s);
    expect(s.drawings.map((d) => d.id)).toEqual(["a"]);
    s = redo(s);
    expect(s.drawings.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("undo and redo with nothing to do change nothing", () => {
    const s = initialDrawingState();
    expect(undo(s)).toBe(s);
    expect(redo(s)).toBe(s);
  });

  it("a new drawing forgets what could have been redone", () => {
    let s = commit(initialDrawingState(), arrow("a"));
    s = undo(s);
    s = commit(s, arrow("b"));
    expect(redo(s)).toBe(s);
    expect(s.drawings.map((d) => d.id)).toEqual(["b"]);
  });

  it("clear removes every drawing and the redo list, and starts again on Arrow", () => {
    let s = selectTool(commit(commit(initialDrawingState(), arrow("a")), arrow("b")), "rect");
    s = undo(s);
    expect(clear(s)).toEqual(initialDrawingState());
  });

  it("undo does not change the tool", () => {
    const s = selectTool(commit(initialDrawingState(), arrow("a")), "highlight");
    expect(undo(s).tool).toBe("highlight");
  });
});

describe("one monitor per drawing", () => {
  it("clamps a point to the monitor", () => {
    expect(clampToMonitor({ x: -30, y: 50 }, screen)).toEqual({ x: 0, y: 50 });
    expect(clampToMonitor({ x: 5000, y: 2000 }, screen)).toEqual({ x: 1920, y: 1080 });
  });

  it("a drag that leaves the monitor ends at its edge", () => {
    const a = drawingFromGesture("arrow", "a", [{ x: 1800, y: 500 }, { x: 4000, y: 500 }], styles, screen);
    expect(a).toMatchObject({ type: "arrow", x2: 1920, y2: 500 });
    const r = drawingFromGesture("rect", "r", [{ x: 100, y: 100 }, { x: -50, y: 9999 }], styles, screen);
    expect(r).toMatchObject({ type: "rect", x: 0, y: 100, width: 100, height: 980 });
  });
});

describe("drawing from a gesture", () => {
  it("a click draws no arrow and no rectangle", () => {
    expect(drawingFromGesture("arrow", "a", [{ x: 5, y: 5 }, { x: 5, y: 5 }], styles, screen)).toBeNull();
    expect(drawingFromGesture("rect", "r", [{ x: 5, y: 5 }, { x: 6, y: 6 }], styles, screen)).toBeNull();
  });

  it("a gesture with no points draws nothing", () => {
    expect(drawingFromGesture("pen", "p", [], styles, screen)).toBeNull();
  });

  it("the pen keeps the path it was given", () => {
    const pen = drawingFromGesture("pen", "p", [{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 0 }], styles, screen);
    expect(pen).toMatchObject({ type: "pen" });
    expect((pen as { points: unknown[] }).points).toHaveLength(3);
  });

  it("the highlighter carries its opacity", () => {
    const h = drawingFromGesture("highlight", "h", [{ x: 0, y: 0 }, { x: 80, y: 0 }], styles, screen);
    expect(h).toMatchObject({ type: "highlight", opacity: { value: 0.8 } });
  });

  it("uses the style it is given", () => {
    const custom = readDrawingStyles({
      rect: { stroke: { color: "#112233", width: 9 }, fill: { mode: "semi", color: "#445566", opacity: 0.3 } },
    });
    const r = drawingFromGesture("rect", "r", [{ x: 0, y: 0 }, { x: 80, y: 40 }], custom, screen);
    expect(r).toMatchObject({ stroke: { color: "#112233", width: 9 }, fill: { mode: "semi", color: "#445566", opacity: 0.3 } });
  });
});
