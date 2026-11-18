// The editor's view of the shortcut registry (src/shared/shortcutRegistry.ts, the one table of keys).
// Components never name a key; they ask which action a key event means, and show `keyLabel(action)`.
//
// Remapping (tickets 28, 47) will pass user overrides as `bindings`; nothing here reads settings yet.

import {
  actionForKeyEvent as actionForKey,
  type Bindings,
  defaultBindings as defaultContextBindings,
  keyLabel as keyLabelFor,
  type ShortcutAction,
  shortcutsIn,
} from "../shared/shortcutRegistry";

export type { Bindings, ShortcutAction };

/** The editor-context rows (tools, editor and view actions; the grid shares them). */
export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = shortcutsIn("editor");

export function defaultBindings(): Bindings {
  return defaultContextBindings("editor");
}

/** The editor action a key event triggers under `bindings`, or null. */
export function actionForKeyEvent(event: Parameters<typeof actionForKey>[0], bindings: Bindings = defaultBindings()): string | null {
  return actionForKey(event, bindings);
}

/** The key as the UI prints it: "A", "Esc", "Ctrl+Delete". */
export function keyLabel(action: string, bindings: Bindings = defaultBindings()): string {
  return keyLabelFor(action, bindings);
}

/**
 * Whether `action` may run while the key press goes into a text field or the Text tool's box: bare
 * keys never do (typing "t" must not switch tools), and of the Ctrl combos only the view keys (zoom,
 * fit) stay active. Ctrl+C and Ctrl+Delete keep their text meaning there (copy the selected words,
 * delete the next word), so they never copy or discard the image from inside a text box.
 */
export function allowedWhileTyping(action: string | null, event: Pick<KeyboardEvent, "ctrlKey">): boolean {
  return action !== null && event.ctrlKey && action.startsWith("view.");
}

const TEXT_INPUT_TYPES = new Set(["", "text", "number", "search", "email", "url", "tel", "password"]);

/** True when a key press is going into a text field (or the text tool's editor), not at the editor's shortcuts. */
export function isTypingTarget(target: Pick<HTMLElement, "tagName" | "isContentEditable"> | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has(((target as HTMLInputElement).type ?? "").toLowerCase());
  return false;
}
