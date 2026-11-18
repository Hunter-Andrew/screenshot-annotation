// The ONE registry of in-app keyboard shortcuts (ticket 45, decisions in ticket 28): action id,
// label, context, default binding, and whether the key may be remapped. The capture overlay, the
// editor and grid key handlers, the tool list, hints and tooltips read their keys from here; no
// component names a key. The capture hotkey is NOT here: it stays a Rust-side setting (ADR 0007).
//
// Overrides (ticket 47) will be an action-id to key-spec map passed where `defaultBindings(context)`
// is passed today. Nothing here reads or writes settings.
//
// A tool's tooltip key and its tool-column entry come from `AnnotationKind.shortcutAction`, so adding
// a tool means adding its row here and nothing else.

/** Where a shortcut is active. A binding clashes only with another in its own context (ticket 28, decision 3). The editor context includes the grid. */
export type ShortcutContext = "overlay" | "editor";

export interface ShortcutAction {
  /** Stable id: `overlay.<action>`, `tool.<type>`, `editor.<action>` or `view.<action>`. What a remapping is keyed by. */
  id: string;
  /** What Settings lists. */
  label: string;
  context: ShortcutContext;
  /** "V", "Escape", "Space", "Ctrl+C", "Ctrl+Delete": modifiers joined with "+", then the key. */
  defaultKey: string;
  /** False for the fixed keys of ticket 28 decision 8 (Esc, Ctrl+Z, Ctrl+Y, Ctrl+C, Delete, Backspace, ...): shown read-only. */
  remappable: boolean;
  /** Delete and Backspace only (earlier marker, kept as is): Settings must not let the user remap them. */
  fixed?: boolean;
}

export const SHORTCUT_REGISTRY: readonly ShortcutAction[] = [
  { id: "overlay.cancel", label: "Cancel the capture", context: "overlay", defaultKey: "Escape", remappable: false },
  { id: "overlay.monitor", label: "Capture the whole monitor under the cursor", context: "overlay", defaultKey: "Space", remappable: true },
  { id: "overlay.magnifier", label: "Toggle the magnifier", context: "overlay", defaultKey: "M", remappable: true },

  { id: "tool.select", label: "Select", context: "editor", defaultKey: "V", remappable: true },
  { id: "tool.arrow", label: "Arrow", context: "editor", defaultKey: "A", remappable: true },
  { id: "tool.line", label: "Line", context: "editor", defaultKey: "L", remappable: true },
  { id: "tool.pen", label: "Pen", context: "editor", defaultKey: "P", remappable: true },
  { id: "tool.rect", label: "Rectangle", context: "editor", defaultKey: "R", remappable: true },
  { id: "tool.ellipse", label: "Ellipse", context: "editor", defaultKey: "E", remappable: true },
  { id: "tool.text", label: "Text", context: "editor", defaultKey: "T", remappable: true },
  { id: "tool.callout", label: "Callout", context: "editor", defaultKey: "O", remappable: true },
  { id: "tool.highlight", label: "Highlighter", context: "editor", defaultKey: "H", remappable: true },
  { id: "tool.blur", label: "Blur", context: "editor", defaultKey: "B", remappable: true },
  { id: "tool.crop", label: "Crop", context: "editor", defaultKey: "C", remappable: true },
  { id: "editor.deselect", label: "Deselect and return to Select", context: "editor", defaultKey: "Escape", remappable: false },
  { id: "editor.copy", label: "Copy (when nothing is selected)", context: "editor", defaultKey: "Ctrl+C", remappable: false },
  { id: "editor.discard", label: "Discard", context: "editor", defaultKey: "Ctrl+Delete", remappable: true },
  { id: "editor.delete", label: "Delete the selected Annotation", context: "editor", defaultKey: "Delete", remappable: false, fixed: true },
  { id: "editor.deleteBackspace", label: "Delete the selected Annotation (Backspace)", context: "editor", defaultKey: "Backspace", remappable: false, fixed: true },
  // Ctrl+Shift+Z must come BEFORE Ctrl+Z: a binding that does not spell out Shift matches with Shift held too.
  { id: "editor.redoAlt", label: "Redo (alternative)", context: "editor", defaultKey: "Ctrl+Shift+Z", remappable: true },
  { id: "editor.undo", label: "Undo", context: "editor", defaultKey: "Ctrl+Z", remappable: false },
  { id: "editor.redo", label: "Redo", context: "editor", defaultKey: "Ctrl+Y", remappable: false },
  { id: "editor.bringForward", label: "Bring forward", context: "editor", defaultKey: "Ctrl+]", remappable: true },
  { id: "editor.sendBack", label: "Send back", context: "editor", defaultKey: "Ctrl+[", remappable: true },
  { id: "view.fit", label: "Fit to window", context: "editor", defaultKey: "Ctrl+0", remappable: true },
  { id: "view.actualSize", label: "Actual size (100%)", context: "editor", defaultKey: "Ctrl+1", remappable: true },
  { id: "view.zoomIn", label: "Zoom in", context: "editor", defaultKey: "Ctrl+=", remappable: true },
  { id: "view.zoomOut", label: "Zoom out", context: "editor", defaultKey: "Ctrl+-", remappable: true },
];

export function shortcutsIn(context: ShortcutContext): readonly ShortcutAction[] {
  return SHORTCUT_REGISTRY.filter((a) => a.context === context);
}

/** Action id to key spec. Defaults today; user overrides after ticket 47. */
export type Bindings = Readonly<Record<string, string>>;

export function defaultBindings(context: ShortcutContext): Bindings {
  return Object.fromEntries(shortcutsIn(context).map((a) => [a.id, a.defaultKey]));
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
export function actionForKeyEvent(event: KeyEventLike, bindings: Bindings): string | null {
  if (event.metaKey) return null;
  const pressed = event.key === "+" ? "=" : event.key === " " ? "space" : event.key.toLowerCase();
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
export function keyLabel(action: string, bindings: Bindings): string {
  const spec = bindings[action] ?? "";
  return spec
    .split("+")
    .map((part) => (part === "Escape" ? "Esc" : part.length === 1 ? part.toUpperCase() : part))
    .join("+");
}
