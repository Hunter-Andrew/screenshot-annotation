// The keys of Drawing mode (ticket 41 decision 4): A arrow, R rectangle, P pen, H highlighter, E eraser, Ctrl+Z,
// Ctrl+Y, Esc. They are fixed (not remappable, not in the shortcut registry) and plain in-window key
// events of the drawing overlay, never global hotkeys, so they cannot reach another app. Pure.
import type { DrawingTool } from "./drawingState";

export type DrawingKeyAction =
  | { kind: "tool"; tool: DrawingTool }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "exit" };

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const TOOL_KEYS: Readonly<Record<string, DrawingTool>> = { a: "arrow", r: "rect", p: "pen", h: "highlight", e: "eraser" };

export function drawingKeyAction(event: KeyLike): DrawingKeyAction | null {
  if (event.altKey || event.metaKey) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (event.ctrlKey) {
    if (event.shiftKey) return null;
    if (key === "z") return { kind: "undo" };
    if (key === "y") return { kind: "redo" };
    return null;
  }
  if (key === "Escape") return { kind: "exit" };
  const tool = TOOL_KEYS[key];
  return tool ? { kind: "tool", tool } : null;
}
