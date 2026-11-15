// The ONE table of editor shortcut keys: action id, label, default key. Components never name a key;
// they ask this module which action a key event means, and show `keyLabel(action)`.
//
// Remapping (ticket 28, M5) builds on `Bindings`: it will store overrides per action id and pass
// them to `actionForKeyEvent` / `keyLabel`. Nothing here reads or writes settings yet.
//
// A tool's tooltip key and its tool-column entry come from `AnnotationKind.shortcutAction`, so
// adding a tool needs no change here: its row is already in the table (tickets 10-12, 18-21).

export interface ShortcutAction {
  /** Stable id: `tool.<type>`, `editor.<action>` or `view.<action>`. What a remapping would be keyed by. */
  id: string;
  /** What Settings will list. */
  label: string;
  /** "V", "Escape", "Ctrl+C", "Ctrl+Delete": modifiers joined with "+", then the key. */
  defaultKey: string;
}

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  { id: "tool.select", label: "Select", defaultKey: "V" },
  { id: "tool.arrow", label: "Arrow", defaultKey: "A" },
  { id: "tool.line", label: "Line", defaultKey: "L" },
  { id: "tool.pen", label: "Pen", defaultKey: "P" },
  { id: "tool.rect", label: "Rectangle", defaultKey: "R" },
  { id: "tool.ellipse", label: "Ellipse", defaultKey: "E" },
  { id: "tool.text", label: "Text", defaultKey: "T" },
  { id: "tool.callout", label: "Callout", defaultKey: "O" },
  { id: "tool.highlight", label: "Highlighter", defaultKey: "H" },
  { id: "tool.blur", label: "Blur", defaultKey: "B" },
  { id: "tool.crop", label: "Crop", defaultKey: "C" },
  { id: "editor.deselect", label: "Deselect and return to Select", defaultKey: "Escape" },
  { id: "editor.copy", label: "Copy (when nothing is selected)", defaultKey: "Ctrl+C" },
  { id: "editor.discard", label: "Discard", defaultKey: "Ctrl+Delete" },
  // { id: "editor.delete", ... "Delete" } (ticket 13)
  { id: "view.fit", label: "Fit to window", defaultKey: "Ctrl+0" },
  { id: "view.actualSize", label: "Actual size (100%)", defaultKey: "Ctrl+1" },
  { id: "view.zoomIn", label: "Zoom in", defaultKey: "Ctrl+=" },
  { id: "view.zoomOut", label: "Zoom out", defaultKey: "Ctrl+-" },
];

/** Action id to key spec. Defaults today; user overrides after ticket 28. */
export type Bindings = Readonly<Record<string, string>>;

export function defaultBindings(): Bindings {
  return Object.fromEntries(SHORTCUT_ACTIONS.map((a) => [a.id, a.defaultKey]));
}

interface ParsedKey {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

function parseKey(spec: string): ParsedKey {
  const parts = spec.split("+");
  // A bare "+" key would split to ["", ""]; keep the last non-empty part (or "+") as the key.
  const key = spec.endsWith("++") ? "+" : parts[parts.length - 1]!;
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  return { key: key.toLowerCase(), ctrl: mods.has("ctrl"), alt: mods.has("alt"), shift: mods.has("shift") };
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;

/** The action a key event triggers under `bindings`, or null. Meta (Windows key) never matches. */
export function actionForKeyEvent(event: KeyEventLike, bindings: Bindings = defaultBindings()): string | null {
  if (event.metaKey) return null;
  const pressed = event.key === "+" ? "=" : event.key.toLowerCase();
  for (const [action, spec] of Object.entries(bindings)) {
    const binding = parseKey(spec);
    if (binding.key !== pressed) continue;
    if (binding.ctrl !== event.ctrlKey || binding.alt !== event.altKey) continue;
    // Shift is part of typing a capital or a symbol (Ctrl+Shift+= makes "+"), so only bindings that
    // spell Shift out are strict about it.
    if (binding.shift && !event.shiftKey) continue;
    return action;
  }
  return null;
}

/** The key as the UI prints it: "A", "Esc", "Ctrl+Delete". */
export function keyLabel(action: string, bindings: Bindings = defaultBindings()): string {
  const spec = bindings[action] ?? "";
  return spec
    .split("+")
    .map((part) => (part === "Escape" ? "Esc" : part.length === 1 ? part.toUpperCase() : part))
    .join("+");
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
