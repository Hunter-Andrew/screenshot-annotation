import { describe, expect, it } from "vitest";
import {
  canUndo,
  initialToolbarState,
  recordEdit,
  selectTool,
  TOOLBAR_BUTTONS,
  toggleCollapsed,
  toggleUseApps,
  undoTarget,
} from "./toolbarState";

describe("the toolbar's buttons", () => {
  it("run Arrow, Rectangle, Pen, Highlighter, Eraser, a divider, Use apps, Undo, Collapse, Exit, each with its key", () => {
    expect(TOOLBAR_BUTTONS.map((b) => (b.kind === "divider" ? "|" : b.id))).toEqual([
      "arrow", "rect", "pen", "highlight", "eraser", "|", "useApps", "undo", "collapse", "exit",
    ]);
    const keys = Object.fromEntries(TOOLBAR_BUTTONS.flatMap((b) => (b.kind === "divider" ? [] : [[b.id, b.key]])));
    expect(keys).toEqual({ arrow: "A", rect: "R", pen: "P", highlight: "H", eraser: "E", useApps: undefined, undo: "Ctrl+Z", collapse: undefined, exit: "Esc" });
  });
});

describe("a fresh toolbar", () => {
  it("starts on Arrow, expanded, with the mouse taken and nothing to undo", () => {
    expect(initialToolbarState()).toMatchObject({ tool: "arrow", collapsed: false, useApps: false });
    expect(canUndo(initialToolbarState())).toBe(false);
    expect(undoTarget(initialToolbarState())).toBeNull();
  });
});

describe("tools and Use apps", () => {
  it("choosing a tool makes it the active one", () => {
    expect(selectTool(initialToolbarState(), "highlight").tool).toBe("highlight");
  });

  it("Use apps toggles, and pressing it again takes the mouse back", () => {
    const on = toggleUseApps(initialToolbarState());
    expect(on.useApps).toBe(true);
    expect(toggleUseApps(on).useApps).toBe(false);
  });

  it("choosing a tool, even the active one, takes the mouse back and keeps the tool", () => {
    const on = toggleUseApps(initialToolbarState());
    expect(selectTool(on, "arrow")).toMatchObject({ useApps: false, tool: "arrow" });
    expect(selectTool(on, "rect")).toMatchObject({ useApps: false, tool: "rect" });
  });
});

describe("collapse", () => {
  it("toggles between the pill and the small pill and changes nothing else", () => {
    const s = toggleUseApps(selectTool(initialToolbarState(), "pen"));
    const small = toggleCollapsed(s);
    expect(small).toMatchObject({ collapsed: true, tool: "pen", useApps: true });
    expect(toggleCollapsed(small).collapsed).toBe(false);
  });
});

describe("undo availability", () => {
  it("is on after a drawing and off again after it is undone", () => {
    let s = recordEdit(initialToolbarState(), { monitor: 0, edit: "commit" });
    expect(canUndo(s)).toBe(true);
    s = recordEdit(s, { monitor: 0, edit: "undo" });
    expect(canUndo(s)).toBe(false);
  });

  it("undoes the newest drawing on whichever monitor it was made", () => {
    let s = initialToolbarState();
    s = recordEdit(s, { monitor: 0, edit: "commit" });
    s = recordEdit(s, { monitor: 1, edit: "commit" });
    s = recordEdit(s, { monitor: 0, edit: "commit" });
    expect(undoTarget(s)).toBe(0);
    s = recordEdit(s, { monitor: 0, edit: "undo" });
    expect(undoTarget(s)).toBe(1);
    s = recordEdit(s, { monitor: 1, edit: "undo" });
    expect(undoTarget(s)).toBe(0);
  });

  it("follows a redo, and a new drawing forgets what could be redone", () => {
    let s = recordEdit(initialToolbarState(), { monitor: 0, edit: "commit" });
    s = recordEdit(s, { monitor: 0, edit: "undo" });
    s = recordEdit(s, { monitor: 0, edit: "redo" });
    expect(canUndo(s)).toBe(true);
    s = recordEdit(s, { monitor: 0, edit: "undo" });
    s = recordEdit(s, { monitor: 1, edit: "commit" });
    s = recordEdit(s, { monitor: 0, edit: "redo" }); // nothing left to redo on monitor 0
    expect(undoTarget(s)).toBe(1);
    s = recordEdit(s, { monitor: 1, edit: "undo" });
    expect(canUndo(s)).toBe(false);
  });

  it("ignores an undo or redo it knows nothing about", () => {
    const s = initialToolbarState();
    expect(recordEdit(s, { monitor: 2, edit: "undo" })).toEqual(s);
    expect(recordEdit(s, { monitor: 2, edit: "redo" })).toEqual(s);
  });

  it("leaves the tool, collapse and Use apps alone", () => {
    const s = toggleCollapsed(toggleUseApps(selectTool(initialToolbarState(), "rect")));
    expect(recordEdit(s, { monitor: 0, edit: "commit" })).toMatchObject({ tool: "rect", collapsed: true, useApps: true });
  });
});
