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
