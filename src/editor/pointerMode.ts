// Which editor tool is active, together with the global pointer highlight (tickets 50, 51; pure, no React).
// While the pointer is on no tool is active (Select included); choosing a tool turns it off; turning it off
// selects Select.

import { SELECT_TOOL } from "./tools";

export interface ToolMode {
  pointerOn: boolean;
  /** The picked tool; the active one only while the pointer is off. */
  tool: string;
}

/** What the editor's tool is while the pointer is on: not any tool's id, so nothing draws or selects. */
export const NO_TOOL = "none";

export const INITIAL_MODE: ToolMode = { pointerOn: false, tool: SELECT_TOOL.id };

export const activeTool = (mode: ToolMode): string => (mode.pointerOn ? NO_TOOL : mode.tool);

/** A tool chosen by click or key: the pointer goes off. */
export const pickTool = (_mode: ToolMode, tool: string): ToolMode => ({ pointerOn: false, tool });

/** The pointer was switched (button, hotkey, tray). Switching off selects Select. Same state again: no change. */
export function pointerChanged(mode: ToolMode, on: boolean): ToolMode {
  if (mode.pointerOn === on) return mode;
  return { pointerOn: on, tool: SELECT_TOOL.id };
}

/** The editor itself hands back to Select (after drawing, a paste, a new image); the pointer stays as it is. */
export const returnToSelect = (mode: ToolMode): ToolMode => ({ ...mode, tool: SELECT_TOOL.id });
