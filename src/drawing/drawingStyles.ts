// The style Drawing mode draws each tool with (ticket 41 decision 2): the editor's saved style for that
// tool, read from the stored tool styles (settings.json) with the editor's own checks, and falling back
// to the tool's default group by group, so a missing, malformed or out-of-range value never breaks drawing.
// Pure; there are no colour or thickness controls in Drawing mode.
import { kindOf } from "../core/annotations";
import { sanitizeStyle, type Style } from "../core/propertyGroups";
import { DRAWING_TOOLS, type DrawingTool } from "./drawingState";

export type DrawingStyles = Record<DrawingTool, Style>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `raw` is what the bridge's `getToolStyles` returned (opaque: anything at all). */
export function readDrawingStyles(raw: unknown): DrawingStyles {
  const stored = isRecord(raw) ? raw : {};
  const styles = {} as DrawingStyles;
  for (const tool of DRAWING_TOOLS) {
    const kind = kindOf(tool)!;
    const saved = sanitizeStyle(stored[tool]);
    const style: Record<string, unknown> = {};
    // Only the groups a drawing of this tool has: the Pen's Eraser mode is a tool setting, not part of a stroke.
    for (const group of kind.groups) style[group] = saved[group] ?? kind.defaultStyle[group];
    styles[tool] = style as Style;
  }
  return styles;
}
