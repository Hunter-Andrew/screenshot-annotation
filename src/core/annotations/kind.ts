// What a tool is, on the model side (pure; the Fabric side lives in src/canvas/shapes/).
import type { Annotation } from "../annotation";
import type { GroupId, Style } from "../propertyGroups";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Settings that shape a drawn Annotation as it is placed (never applied to one that already exists). */
export interface DrawOptions {
  /** The least width of a Text when it is placed, in Capture pixels (0 or absent: none). */
  textMinWidth?: number;
}

export interface AnnotationKind<A extends Annotation = Annotation> {
  readonly type: A["type"];
  /** The tool's name in the tool column. */
  readonly label: string;
  /** Id of its default key in the one shortcut table (src/editor/shortcuts.ts). */
  readonly shortcutAction: string;
  /** The property groups this tool opts into; the Style panel shows exactly these. */
  readonly groups: readonly GroupId[];
  /** Stroke thickness presets for this tool, when it is not the shared default (the Highlighter's larger ones). */
  readonly thicknessPresets?: readonly number[];
  /**
   * Property groups that belong to the active TOOL only (the Pen's Mode and Eraser size): the Style panel shows
   * them while the tool is picked, above `groups`, and never for a selected Annotation, which does not store them.
   */
  readonly toolGroups?: readonly GroupId[];
  /** The style a fresh Annotation of this kind starts with, until the user has restyled the tool. */
  readonly defaultStyle: Style;
  /** The Annotation a drag from `from` to `to` draws (Capture pixels), or null if it is too small to keep. `area` is the visible area: a typed-in box is kept inside it. */
  fromDrag(
    id: string,
    from: Point,
    to: Point,
    style: Style,
    area?: { x?: number; y?: number; width: number; height: number },
    options?: DrawOptions,
  ): A | null;
  /** Freehand tools only (Pen): the Annotation for all the points a drag passed through; the canvas prefers it to `fromDrag`. */
  fromPath?(id: string, points: readonly Point[], style: Style): A | null;
  /** Freehand tools only: holding Shift while drawing makes a straight horizontal stroke (Highlighter). */
  readonly horizontalWithShift?: boolean;
  /**
   * True for a tool the user types into (Text): a click makes the box and starts editing it in place;
   * it becomes an Annotation only once something has been typed.
   */
  readonly typedInPlace?: boolean;
  /**
   * True when the Annotation stays with no text (the Callout and Text box: the box itself is worth keeping empty); a
   * typed-in Annotation without it (Text) is not made when nothing was typed, and keeps its old words when cleared.
   */
  readonly keepsEmptyText?: boolean;
  /** True for an Annotation that is pasted rather than drawn (the image): no tool-column button, no shortcut. */
  readonly pasted?: boolean;
}
