// The canvas side of per-selection text styling: tells the editor what the characters selected in the Text or Callout
// being typed in look like, and styles them when the Style panel asks. The work itself is the shape's (TextShape).
import type { Canvas } from "fabric";
import type { RunFont } from "../core/annotations/runs";
import { TextShape } from "./shapes/textShape";
import type { TextSelection } from "./types";

export function watchTextSelection(canvas: Canvas, report: (selection: TextSelection | null) => void) {
  const editing = (): TextShape | null => {
    const active = canvas.getActiveObject();
    return active instanceof TextShape && active.isEditing ? active : null;
  };
  let last = "null";
  const update = () => {
    const shown = editing()?.textSelection();
    const next = shown ? { font: shown.font } : null;
    const key = JSON.stringify(next);
    if (key === last) return;
    last = key;
    report(next);
  };
  // Fabric announces a selection change just before it stores it, so look a moment later.
  const later = () => queueMicrotask(update);
  // A box typed into for the first time is taken off the canvas when its edit ends (before Fabric announces the end).
  const events = ["text:selection:changed", "text:changed", "text:editing:entered", "text:editing:exited", "object:removed", "selection:cleared"] as const;
  for (const event of events) canvas.on(event, later);
  return {
    style(patch: RunFont) {
      if (editing()?.styleSelection(patch)) {
        canvas.requestRenderAll();
        update();
      }
    },
    focus() {
      editing()?.focusText();
    },
  };
}
