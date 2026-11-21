// The style Drawing mode draws each tool with (ticket 41 decision 2): the editor's saved style for that
// tool, read from the stored tool styles (settings.json) with the editor's own checks, and falling back
// to the tool's default group by group, so a missing, malformed or out-of-range value never breaks drawing.
// Pure; there are no colour or thickness controls in Drawing mode.
import { kindOf } from "../core/annotations";
import { DEFAULT_ERASER_SIZE, sanitizeStyle, type Style } from "../core/propertyGroups";
import { DRAWN_TOOLS, type DrawnTool } from "./drawingState";

/**
 * Drawing mode's Highlighter opacity, in percent: its own setting (Settings > Demo tools), because the editor's
 * saved Highlighter opacity is a multiply that a transparent overlay cannot do. `src-tauri/src/settings.rs`
 * `DRAWING_HIGHLIGHTER_OPACITY` must match (see rustParity.test.ts).
 */
export const DRAWING_HIGHLIGHTER_OPACITY = { min: 5, max: 60, default: 20 } as const;

/** A whole percent inside the range; anything that is not a finite number is the default. */
export function drawingHighlighterOpacityPercent(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DRAWING_HIGHLIGHTER_OPACITY.default;
  return Math.min(DRAWING_HIGHLIGHTER_OPACITY.max, Math.max(DRAWING_HIGHLIGHTER_OPACITY.min, Math.round(raw)));
}

export type DrawingStyles = Record<DrawnTool, Style>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `raw` is what the bridge's `getToolStyles` returned (opaque: anything at all). `highlighterOpacityPercent` is
 * the Drawing mode setting (opaque too); the Highlighter takes its colour and thickness from `raw` but never its opacity.
 */
export function readDrawingStyles(raw: unknown, highlighterOpacityPercent?: unknown): DrawingStyles {
  const stored = isRecord(raw) ? raw : {};
  const styles = {} as DrawingStyles;
  for (const tool of DRAWN_TOOLS) {
    const kind = kindOf(tool)!;
    const saved = sanitizeStyle(stored[tool]);
    const style: Record<string, unknown> = {};
    // Only the groups a drawing of this tool has: the Pen's Eraser mode is a tool setting, not part of a stroke.
    for (const group of kind.groups) style[group] = saved[group] ?? kind.defaultStyle[group];
    if (tool === "highlight") style.opacity = { value: drawingHighlighterOpacityPercent(highlighterOpacityPercent) / 100 };
    styles[tool] = style as Style;
  }
  return styles;
}

/**
 * The Eraser's size (its diameter, physical pixels): the one the user saved with the editor's Pen tool (Style panel, Eraser
 * size), read from the same stored tool styles with the editor's own checks, and the editor's default when it is missing or
 * out of range. The Pen's Mode (pen or eraser) is the editor's own choice and does not matter here.
 */
export function readEraserSize(raw: unknown): number {
  const pen = isRecord(raw) ? sanitizeStyle(raw.pen) : {};
  return pen.eraser?.size ?? DEFAULT_ERASER_SIZE;
}
