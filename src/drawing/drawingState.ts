// The state of one Drawing mode overlay (ticket 41 decisions 2 to 5): the chosen tool, the drawings
// made so far, and what Undo took away so Redo can bring it back. Pure and immutable. Each monitor has
// its own overlay and so its own state: a drawing never spans two monitors, because every point is
// clamped to the monitor it started on (`clampToMonitor`). Nothing here is ever saved.
import type { Annotation } from "../core/annotation";
import { kindOf, type Point } from "../core/annotations";
import { erasePieces } from "../core/annotations/erase";
import type { PenAnnotation } from "../core/annotations/pen";
import type { DrawingStyles } from "./drawingStyles";

/** The tools that draw, as Annotation types (so the editor's tool definitions and styles apply unchanged). */
export const DRAWN_TOOLS = ["arrow", "rect", "pen", "highlight"] as const;
export type DrawnTool = (typeof DRAWN_TOOLS)[number];
/** Every tool on the toolbar: the four that draw, then the Eraser, which cuts Pen strokes instead of adding a drawing. */
export const DRAWING_TOOLS = [...DRAWN_TOOLS, "eraser"] as const;
export type DrawingTool = (typeof DRAWING_TOOLS)[number];
export const DEFAULT_TOOL: DrawingTool = "arrow";

export interface DrawingState {
  tool: DrawingTool;
  /** In drawing order. */
  drawings: readonly Annotation[];
  /**
   * What the drawings were before each step (a drawing or an erase drag) that Undo can take back, the last
   * step's last. A step is a whole list, so an erase that cut several strokes is one Undo step, as in the editor.
   */
  before: readonly (readonly Annotation[])[];
  /** What the drawings were after each step Undo took back, the next one to redo last. Emptied by a new step. */
  after: readonly (readonly Annotation[])[];
}

export const initialDrawingState = (): DrawingState => ({ tool: DEFAULT_TOOL, drawings: [], before: [], after: [] });

export const selectTool = (state: DrawingState, tool: DrawingTool): DrawingState => ({ ...state, tool });

const step = (state: DrawingState, drawings: readonly Annotation[]): DrawingState => ({
  ...state,
  drawings,
  before: [...state.before, state.drawings],
  after: [],
});

export const commit = (state: DrawingState, drawing: Annotation): DrawingState => step(state, [...state.drawings, drawing]);

/** One erase drag as one step: `drawings` is the list `eraseDrawings` returned. */
export const commitErase = (state: DrawingState, drawings: readonly Annotation[]): DrawingState => step(state, drawings);

export function undo(state: DrawingState): DrawingState {
  const previous = state.before[state.before.length - 1];
  if (!previous) return state;
  return { ...state, drawings: previous, before: state.before.slice(0, -1), after: [...state.after, state.drawings] };
}

export function redo(state: DrawingState): DrawingState {
  const next = state.after[state.after.length - 1];
  if (!next) return state;
  return { ...state, drawings: next, before: [...state.before, state.drawings], after: state.after.slice(0, -1) };
}

/**
 * What the drawings are after an eraser of `size` (its diameter, physical pixels) travelled along `path`, or null when
 * it touched nothing. As in the editor's Eraser, only Pen strokes are cut (never a Highlighter stroke, Arrow or Rectangle):
 * a stroke becomes its pieces in place (each a Pen stroke of the same style) or vanishes when nothing is left.
 */
export function eraseDrawings(
  drawings: readonly Annotation[],
  path: readonly Point[],
  size: number,
  newId: () => string,
): Annotation[] | null {
  let touched = false;
  const result: Annotation[] = [];
  for (const drawing of drawings) {
    const pieces = drawing.type === "pen" ? erasePieces(drawing.points, path, size / 2) : null;
    if (!pieces) {
      result.push(drawing);
      continue;
    }
    touched = true;
    const pen = drawing as PenAnnotation;
    pieces.forEach((points, i) => result.push({ ...pen, id: i === 0 ? pen.id : newId(), points }));
  }
  return touched ? result : null;
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
  tool: DrawnTool,
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
