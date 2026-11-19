// @vitest-environment node
import { describe, expect, it } from "vitest";
import { activeTool, INITIAL_MODE, NO_TOOL, pickTool, pointerChanged, returnToSelect } from "./pointerMode";

const on = pointerChanged(pickTool(INITIAL_MODE, "rect"), true);

describe("the editor tool and the global pointer highlight", () => {
  it("starts with the Select tool and the pointer off", () => {
    expect(INITIAL_MODE).toEqual({ pointerOn: false, tool: "select" });
    expect(activeTool(INITIAL_MODE)).toBe("select");
  });

  it("pointer on: no tool is active, Select included", () => {
    expect(on.pointerOn).toBe(true);
    expect(activeTool(on)).toBe(NO_TOOL);
    expect(activeTool(pointerChanged(INITIAL_MODE, true))).toBe(NO_TOOL);
  });

  it("choosing a tool turns the pointer off and selects that tool", () => {
    expect(pickTool(on, "pen")).toEqual({ pointerOn: false, tool: "pen" });
    expect(activeTool(pickTool(on, "select"))).toBe("select");
  });

  it("pointer off (button, hotkey or tray) selects Select, not the previous tool", () => {
    expect(pointerChanged(on, false)).toEqual({ pointerOn: false, tool: "select" });
  });

  it("a repeated report of the same state changes nothing (the echo of our own request)", () => {
    expect(pointerChanged(on, true)).toBe(on);
    const pen = pickTool(INITIAL_MODE, "pen");
    expect(pointerChanged(pen, false)).toBe(pen);
  });

  it("returning to Select after drawing or pasting leaves the pointer as it is", () => {
    expect(returnToSelect(pickTool(INITIAL_MODE, "rect"))).toEqual({ pointerOn: false, tool: "select" });
    expect(returnToSelect(on)).toEqual({ pointerOn: true, tool: "select" });
    expect(activeTool(returnToSelect(on))).toBe(NO_TOOL);
  });
});
