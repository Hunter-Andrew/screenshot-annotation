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

/** Crop is a tool but not an Annotation kind: it sets the image's visible area (core/crop.ts). */
export const CROP_TOOL: Tool = { id: "crop", label: "Crop", shortcutAction: "tool.crop" };

export const TOOLS: readonly Tool[] = [
  SELECT_TOOL,
  ...ANNOTATION_KINDS.filter((k) => !k.pasted).map((k) => ({ id: k.type as string, label: k.label, shortcutAction: k.shortcutAction })),
  CROP_TOOL,
];

/**
 * Per-tool default for "return to Select after one use". The one table of tool-behavior defaults, next
 * to the registry (ticket 28's remapping must not scatter it): a new tool adds one line here. The user's
 * own choice per tool (the Style panel checkbox) overrides it; see toolBehavior.ts.
 * Every drawing tool but Text and Callout (which are edited right after) stays on the tool, since shapes come in runs; Crop switches back.
 */
export const DEFAULT_RETURN_TO_SELECT: Readonly<Record<string, boolean>> = {
  arrow: false,
  line: false,
  rect: false,
  ellipse: false,
  text: true,
  callout: true,
  pen: false,
  highlight: false,
  blur: false,
  crop: true,
};
