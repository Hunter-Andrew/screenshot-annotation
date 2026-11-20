// @vitest-environment node
import { describe, expect, it } from "vitest";
import { activeTool, INITIAL_MODE, NO_TOOL, pickTool, laserPointerChanged, returnToSelect } from "./laserPointerMode";

const on = laserPointerChanged(pickTool(INITIAL_MODE, "rect"), true);

describe("the editor tool and the global laser pointer", () => {
  it("starts with the Select tool and the pointer off", () => {
    expect(INITIAL_MODE).toEqual({ laserPointerOn: false, tool: "select" });
    expect(activeTool(INITIAL_MODE)).toBe("select");
  });

  it("pointer on: no tool is active, Select included", () => {
    expect(on.laserPointerOn).toBe(true);
    expect(activeTool(on)).toBe(NO_TOOL);
    expect(activeTool(laserPointerChanged(INITIAL_MODE, true))).toBe(NO_TOOL);
  });

  it("choosing a tool turns the pointer off and selects that tool", () => {
    expect(pickTool(on, "pen")).toEqual({ laserPointerOn: false, tool: "pen" });
    expect(activeTool(pickTool(on, "select"))).toBe("select");
  });

  it("pointer off (button, hotkey or tray) selects Select, not the previous tool", () => {
    expect(laserPointerChanged(on, false)).toEqual({ laserPointerOn: false, tool: "select" });
  });

  it("a repeated report of the same state changes nothing (the echo of our own request)", () => {
    expect(laserPointerChanged(on, true)).toBe(on);
    const pen = pickTool(INITIAL_MODE, "pen");
    expect(laserPointerChanged(pen, false)).toBe(pen);
  });

  it("returning to Select after drawing or pasting leaves the pointer as it is", () => {
    expect(returnToSelect(pickTool(INITIAL_MODE, "rect"))).toEqual({ laserPointerOn: false, tool: "select" });
    expect(returnToSelect(on)).toEqual({ laserPointerOn: true, tool: "select" });
    expect(activeTool(returnToSelect(on))).toBe(NO_TOOL);
  });
});
