// The state of the Drawing mode toolbar (ticket 53, ticket 41 decisions 6 and 7): the active tool, whether the
// pill is collapsed, whether "Use apps" has given the mouse to the apps below, and what Undo can take back.
// Pure and immutable; the window, the buttons and the messages between windows are in DrawingToolbar.tsx.
import { formatKeySpec, SHORTCUT_REGISTRY } from "../shared/shortcutRegistry";
import { DEFAULT_TOOL, type DrawingTool } from "./drawingState";

/** What an overlay did to its drawings, told to the toolbar so Undo knows what it can take back. */
export interface DrawingEdit {
  /** The monitor (overlay) the change happened on. */
  monitor: number;
  edit: "commit" | "undo" | "redo";
}

export interface ToolbarState {
  tool: DrawingTool;
  collapsed: boolean;
  /** "Use apps": the overlays are click-through, the drawings stay visible. */
  useApps: boolean;
  /** Monitor of every drawing now showing, oldest first: the last is what the Undo button takes back. */
  made: readonly number[];
  /** Monitor of every drawing Undo took away, so a redo is matched; emptied by a new drawing. */
  undone: readonly number[];
}

/** `remembered`: the tool last used earlier in this app session (Arrow when there is none). */
export const initialToolbarState = (remembered: DrawingTool = DEFAULT_TOOL): ToolbarState => ({
  tool: remembered,
  collapsed: false,
  useApps: false,
  made: [],
  undone: [],
});

/** Choosing a drawing tool, the active one included, takes the mouse back from the apps. */
export const selectTool = (state: ToolbarState, tool: DrawingTool): ToolbarState => ({ ...state, tool, useApps: false });

export const toggleUseApps = (state: ToolbarState): ToolbarState => ({ ...state, useApps: !state.useApps });

export const toggleCollapsed = (state: ToolbarState): ToolbarState => ({ ...state, collapsed: !state.collapsed });

export const canUndo = (state: ToolbarState): boolean => state.made.length > 0;

/** The monitor whose overlay should undo its last drawing: where the newest drawing still showing was made. */
export const undoTarget = (state: ToolbarState): number | null => state.made[state.made.length - 1] ?? null;

/** `list` without the last occurrence of `monitor`, or null when it holds none. */
function withoutLast(list: readonly number[], monitor: number): number[] | null {
  const at = list.lastIndexOf(monitor);
  return at < 0 ? null : [...list.slice(0, at), ...list.slice(at + 1)];
}

export function recordEdit(state: ToolbarState, { monitor, edit }: DrawingEdit): ToolbarState {
  if (edit === "commit") return { ...state, made: [...state.made, monitor], undone: [] };
  if (edit === "undo") {
    const made = withoutLast(state.made, monitor);
    return made ? { ...state, made, undone: [...state.undone, monitor] } : state;
  }
  const undone = withoutLast(state.undone, monitor);
  return undone ? { ...state, made: [...state.made, monitor], undone } : state;
}

export type ToolbarButtonId = DrawingTool | "useApps" | "undo" | "collapse" | "exit";

export type ToolbarButton =
  | { kind: "divider" }
  | {
      kind: "button";
      id: ToolbarButtonId;
      /** The name on the button (its accessible name and the start of its tooltip). */
      label: string;
      /** The key printed in the tooltip; none for the buttons that have no key. */
      key?: string;
    };

const keyOf = (id: string): string => {
  const action = SHORTCUT_REGISTRY.find((a) => a.id === id);
  return action ? formatKeySpec(action.defaultKey) : "";
};

const button = (id: ToolbarButtonId, label: string, action?: string): ToolbarButton => ({
  kind: "button",
  id,
  label,
  key: action ? keyOf(action) : undefined,
});

/** Left to right, as in ticket 41 decision 6. The keys come from the shortcut registry's Drawing mode rows. */
export const TOOLBAR_BUTTONS: readonly ToolbarButton[] = [
  button("arrow", "Arrow", "drawing.arrow"),
  button("rect", "Rectangle", "drawing.rect"),
  button("pen", "Pen", "drawing.pen"),
  button("highlight", "Highlighter", "drawing.highlight"),
  { kind: "divider" },
  button("useApps", "Use apps"),
  button("undo", "Undo", "drawing.undo"),
  button("collapse", "Collapse"),
  button("exit", "Exit", "drawing.exit"),
];
