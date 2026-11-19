import { describe, expect, it } from "vitest";
import { drawingKeyAction } from "./drawingKeys";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("the fixed keys of Drawing mode", () => {
  it("A, R, P and H choose the tools, in either case", () => {
    expect(drawingKeyAction(key("a"))).toEqual({ kind: "tool", tool: "arrow" });
    expect(drawingKeyAction(key("R"))).toEqual({ kind: "tool", tool: "rect" });
    expect(drawingKeyAction(key("p"))).toEqual({ kind: "tool", tool: "pen" });
    expect(drawingKeyAction(key("H", { shiftKey: true }))).toEqual({ kind: "tool", tool: "highlight" });
  });

  it("Ctrl+Z undoes, Ctrl+Y redoes, Esc exits", () => {
    expect(drawingKeyAction(key("z", { ctrlKey: true }))).toEqual({ kind: "undo" });
    expect(drawingKeyAction(key("Z", { ctrlKey: true }))).toEqual({ kind: "undo" });
    expect(drawingKeyAction(key("y", { ctrlKey: true }))).toEqual({ kind: "redo" });
    expect(drawingKeyAction(key("Escape"))).toEqual({ kind: "exit" });
  });

  it("a tool letter with Ctrl, Alt or Windows held is not a tool key", () => {
    for (const mods of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      expect(drawingKeyAction(key("a", mods))).toBeNull();
    }
  });

  it("Z and Y need Ctrl, and Ctrl+Shift+Z or Alt combinations are not undo", () => {
    expect(drawingKeyAction(key("z"))).toBeNull();
    expect(drawingKeyAction(key("y"))).toBeNull();
    expect(drawingKeyAction(key("z", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(drawingKeyAction(key("z", { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it("every other key does nothing", () => {
    for (const k of ["b", "Enter", "Delete", " ", "1", "F5", "Tab"]) expect(drawingKeyAction(key(k))).toBeNull();
    expect(drawingKeyAction(key("Escape", { ctrlKey: true }))).toBeNull();
  });
});
