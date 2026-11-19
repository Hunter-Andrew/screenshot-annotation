// The editor-specific side of the shortcut registry (src/shared/shortcutRegistry.ts, the one table of
// keys): which actions may run while the user is typing, and what counts as a typing target.
// Components never name a key; they ask the registry which action a key event means.

import { shortcutsIn, type ShortcutAction } from "../shared/shortcutRegistry";

/** The editor-context rows (tools, editor and view actions; the grid shares them). */
export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = shortcutsIn("editor");

/**
 * Whether `action` may run while the key press goes into a text field or the Text tool's box (ticket
 * 28 decision 7): bare and Shift-only keys never do (typing "t" must not switch tools); Ctrl and Alt
 * combinations do, for the view keys and any remappable action. The fixed editing keys (Ctrl+C,
 * Ctrl+Delete even when Discard sits on it, ...) keep their text meaning there, so they never copy or discard the image.
 * AltGr (reported as Ctrl+Alt) is how some keyboards type a character, so it never counts as a chord.
 */
export function allowedWhileTyping(
  action: string | null,
  event: Pick<KeyboardEvent, "ctrlKey"> & { altKey?: boolean; key?: string; getModifierState?: (key: string) => boolean },
): boolean {
  if (action === null || !(event.ctrlKey || event.altKey)) return false;
  if (event.getModifierState?.("AltGraph")) return false;
  if (event.key === "Delete" || event.key === "Backspace") return false; // Ctrl+Delete deletes a word in a text box
  return action.startsWith("view.") || (SHORTCUT_ACTIONS.find((a) => a.id === action)?.remappable ?? false);
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
