// The tool column's entries: Select, then one per registered Annotation kind (core/annotations/index.ts).
// A new drawing tool appears here (and gets its key) the moment its kind is registered.
import { ANNOTATION_KINDS } from "../core/annotations";

export interface Tool {
  /** "select" or an Annotation type. */
  id: string;
  label: string;
  /** Id in the shortcut table (shortcuts.ts). */
  shortcutAction: string;
}

export const SELECT_TOOL: Tool = { id: "select", label: "Select", shortcutAction: "tool.select" };

export const TOOLS: readonly Tool[] = [
  SELECT_TOOL,
  ...ANNOTATION_KINDS.map((k) => ({ id: k.type as string, label: k.label, shortcutAction: k.shortcutAction })),
];

/**
 * Per-tool default for "return to Select after one use". The one table of tool-behavior defaults, next
 * to the registry (ticket 28's remapping must not scatter it): a new tool adds one line here. The user's
 * own choice per tool (the Style panel checkbox) overrides it; see toolBehavior.ts.
 * Pen stays on the tool (strokes come in runs); the rest switch back, as drawing always did.
 */
export const DEFAULT_RETURN_TO_SELECT: Readonly<Record<string, boolean>> = {
  arrow: true,
  line: true,
  rect: true,
  ellipse: true,
  text: true,
  callout: true,
  pen: false,
  highlight: false,
  // Tickets 18-21 add: callout, highlight, blur, crop.
};
