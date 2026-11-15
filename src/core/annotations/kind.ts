// What a tool is, on the model side (pure; the Fabric side lives in src/canvas/shapes/).
import type { Annotation } from "../annotation";
import type { GroupId, Style } from "../propertyGroups";

export interface Point {
  x: number;
  y: number;
}

export interface AnnotationKind<A extends Annotation = Annotation> {
  readonly type: A["type"];
  /** The tool's name in the tool column. */
  readonly label: string;
  /** Id of its default key in the one shortcut table (src/editor/shortcuts.ts). */
  readonly shortcutAction: string;
  /** The property groups this tool opts into; the Style panel shows exactly these. */
  readonly groups: readonly GroupId[];
  /** The style a fresh Annotation of this kind starts with, until the user has restyled the tool. */
  readonly defaultStyle: Style;
  /** The Annotation a drag from `from` to `to` draws (Capture pixels), or null if it is too small to keep. */
  fromDrag(id: string, from: Point, to: Point, style: Style): A | null;
}
