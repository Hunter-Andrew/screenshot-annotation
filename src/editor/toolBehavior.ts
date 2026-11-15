// What a drawing tool does after one use: stay active, or hand back to Select (pure; no React).
import { DEFAULT_RETURN_TO_SELECT } from "./tools";

/** The user's own choices, tool id -> returns to Select. Only the tools they changed are present. */
export type BehaviorChoices = Readonly<Record<string, boolean>>;

/** Key of the choices inside the stored tool styles (settings.json `toolStyles`; a tool type never has this name). */
export const BEHAVIOR_KEY = "toolBehavior";

/** Whether the editor switches back to Select after `toolId` has drawn one Annotation. */
export function returnsToSelect(toolId: string, chosen: BehaviorChoices): boolean {
  return chosen[toolId] ?? DEFAULT_RETURN_TO_SELECT[toolId] ?? true;
}

/** The stored choices, read defensively: booleans only; anything else (or a missing value) means "use the default". */
export function sanitizeBehavior(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [tool, value] of Object.entries(raw)) if (typeof value === "boolean") out[tool] = value;
  return out;
}
