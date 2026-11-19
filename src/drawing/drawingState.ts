// The state of one Drawing mode overlay (ticket 41 decisions 2 to 5): the chosen tool, the drawings
// made so far, and what Undo took away so Redo can bring it back. Pure and immutable. Each monitor has
// its own overlay and so its own state: a drawing never spans two monitors, because every point is
// clamped to the monitor it started on (`clampToMonitor`). Nothing here is ever saved.
import type { Annotation } from "../core/annotation";
import { kindOf, type Point } from "../core/annotations";
import type { DrawingStyles } from "./drawingStyles";

/** The four tools, as Annotation types (so the editor's tool definitions and styles apply unchanged). */
export const DRAWING_TOOLS = ["arrow", "rect", "pen", "highlight"] as const;
export type DrawingTool = (typeof DRAWING_TOOLS)[number];
export const DEFAULT_TOOL: DrawingTool = "arrow";

export interface DrawingState {
  tool: DrawingTool;
  /** In drawing order; the last one is what Undo removes. */
  drawings: readonly Annotation[];
  /** What Undo removed, the next one to redo last. Emptied by a new drawing. */
  undone: readonly Annotation[];
}

export const initialDrawingState = (): DrawingState => ({ tool: DEFAULT_TOOL, drawings: [], undone: [] });

export const selectTool = (state: DrawingState, tool: DrawingTool): DrawingState => ({ ...state, tool });

export const commit = (state: DrawingState, drawing: Annotation): DrawingState => ({
  ...state,
  drawings: [...state.drawings, drawing],
  undone: [],
});

export function undo(state: DrawingState): DrawingState {
  const last = state.drawings[state.drawings.length - 1];
  if (!last) return state;
  return { ...state, drawings: state.drawings.slice(0, -1), undone: [...state.undone, last] };
}

export function redo(state: DrawingState): DrawingState {
  const next = state.undone[state.undone.length - 1];
  if (!next) return state;
  return { ...state, drawings: [...state.drawings, next], undone: state.undone.slice(0, -1) };
}

/** Everything gone, as when the mode starts: Esc leaves the mode and clears. */
export const clear = (_state: DrawingState): DrawingState => initialDrawingState();

/** A point pulled inside a monitor of `size` physical pixels. */
export function clampToMonitor(point: Point, size: { width: number; height: number }): Point {
  return {
    x: Math.min(Math.max(point.x, 0), size.width),
    y: Math.min(Math.max(point.y, 0), size.height),
  };
}

/**
 * The drawing a pointer gesture makes, or null when it is too small to keep (a click, a gesture with no
 * points). `points` are the monitor-local physical pixels the pointer passed through, first to last.
 * The Arrow and Rectangle use the first and last point; the Pen and Highlighter keep the whole path.
 */
export function drawingFromGesture(
  tool: DrawingTool,
  id: string,
  points: readonly Point[],
  styles: DrawingStyles,
  size: { width: number; height: number },
): Annotation | null {
  const kept = points.map((p) => clampToMonitor(p, size));
  const first = kept[0];
  const last = kept[kept.length - 1];
  if (!first || !last) return null;
  const kind = kindOf(tool)!;
  const style = styles[tool];
  return kind.fromPath ? kind.fromPath(id, kept, style) : kind.fromDrag(id, first, last, style);
}
