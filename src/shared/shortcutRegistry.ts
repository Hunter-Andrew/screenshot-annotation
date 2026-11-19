// The ONE registry of in-app keyboard shortcuts (ticket 45, decisions in ticket 28): action id,
// label, context, default binding, and whether the key may be remapped. The capture overlay, the
// editor and grid key handlers, the tool list, hints and tooltips read their keys from here; no
// component names a key. The capture hotkey is NOT here: it stays a Rust-side setting (ADR 0007).
//
// A user's overrides (src/shared/shortcutBindings.ts) become an action-id to key-spec map, passed
// where `defaultBindings(context)` is. Nothing here reads or writes settings.
//
// A tool's tooltip key and its tool-column entry come from `AnnotationKind.shortcutAction`, so adding
// a tool means adding its row here and nothing else.

/** Where a shortcut is active. A binding clashes only with another in its own context (ticket 28, decision 3). The editor context includes the grid. */
export type ShortcutContext = "overlay" | "editor" | "drawing";

/** Every context, in display order, with the name Settings and refusal messages call it. */
export const CONTEXT_NAME: Readonly<Record<ShortcutContext, string>> = { overlay: "Capture overlay", editor: "Editor", drawing: "Drawing mode" };
export const SHORTCUT_CONTEXTS = Object.keys(CONTEXT_NAME) as readonly ShortcutContext[];

export interface ShortcutAction {
  /** Stable id: `overlay.<action>`, `tool.<type>`, `editor.<action>` or `view.<action>`. What a remapping is keyed by. */
  id: string;
  /** What Settings lists. */
  label: string;
  context: ShortcutContext;
  /** "V", "Escape", "Space", "Ctrl+C", "Ctrl+Delete": modifiers joined with "+", then the key. */
  defaultKey: string;
  /** False for the fixed keys of ticket 28 decision 8 (Esc, Ctrl+Z, Ctrl+Y, Ctrl+C, Delete, Backspace, ...) and the Arrow, Rectangle, Pen and Highlighter keys, fixed to match the drawing mode (ticket 41 decision 4, ticket 54): shown read-only, and a saved override is ignored. */
  remappable: boolean;
}

export const SHORTCUT_REGISTRY: readonly ShortcutAction[] = [
  { id: "overlay.cancel", label: "Cancel the capture", context: "overlay", defaultKey: "Escape", remappable: false },
  { id: "overlay.monitor", label: "Capture the whole monitor under the cursor", context: "overlay", defaultKey: "Space", remappable: true },
  { id: "overlay.magnifier", label: "Toggle the magnifier", context: "overlay", defaultKey: "M", remappable: true },

  { id: "tool.select", label: "Select", context: "editor", defaultKey: "V", remappable: true },
  { id: "tool.arrow", label: "Arrow", context: "editor", defaultKey: "A", remappable: false },
  { id: "tool.line", label: "Line", context: "editor", defaultKey: "L", remappable: true },
  { id: "tool.pen", label: "Pen", context: "editor", defaultKey: "P", remappable: false },
  { id: "tool.rect", label: "Rectangle", context: "editor", defaultKey: "R", remappable: false },
  { id: "tool.ellipse", label: "Ellipse", context: "editor", defaultKey: "E", remappable: true },
  { id: "tool.text", label: "Text", context: "editor", defaultKey: "T", remappable: true },
  { id: "tool.callout", label: "Callout", context: "editor", defaultKey: "O", remappable: true },
  { id: "tool.highlight", label: "Highlighter", context: "editor", defaultKey: "H", remappable: false },
  { id: "tool.blur", label: "Blur", context: "editor", defaultKey: "B", remappable: true },
  { id: "tool.crop", label: "Crop", context: "editor", defaultKey: "C", remappable: true },
  { id: "editor.deselect", label: "Deselect and return to Select", context: "editor", defaultKey: "Escape", remappable: false },
  { id: "editor.copy", label: "Copy (when nothing is selected)", context: "editor", defaultKey: "Ctrl+C", remappable: false },
  { id: "editor.discard", label: "Discard", context: "editor", defaultKey: "Ctrl+Delete", remappable: true },
  { id: "editor.delete", label: "Delete the selected Annotation", context: "editor", defaultKey: "Delete", remappable: false },
  { id: "editor.deleteBackspace", label: "Delete the selected Annotation (Backspace)", context: "editor", defaultKey: "Backspace", remappable: false },
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

  // Drawing mode (ticket 41 decision 4, ticket 53): fixed, in-window keys of the drawing overlay, listed read-only in
  // Settings. src/drawing/drawingKeys.ts reads the keys; a test keeps it and this table in step.
  { id: "drawing.arrow", label: "Arrow", context: "drawing", defaultKey: "A", remappable: false },
  { id: "drawing.rect", label: "Rectangle", context: "drawing", defaultKey: "R", remappable: false },
  { id: "drawing.pen", label: "Pen", context: "drawing", defaultKey: "P", remappable: false },
  { id: "drawing.highlight", label: "Highlighter", context: "drawing", defaultKey: "H", remappable: false },
  { id: "drawing.undo", label: "Undo the last drawing", context: "drawing", defaultKey: "Ctrl+Z", remappable: false },
  { id: "drawing.redo", label: "Redo", context: "drawing", defaultKey: "Ctrl+Y", remappable: false },
  { id: "drawing.exit", label: "Leave Drawing mode and clear the drawings", context: "drawing", defaultKey: "Escape", remappable: false },
];

export function shortcutsIn(context: ShortcutContext): readonly ShortcutAction[] {
  return SHORTCUT_REGISTRY.filter((a) => a.context === context);
}

/** Action id to key spec: the defaults, or the defaults with the user's overrides applied. */
export type Bindings = Readonly<Record<string, string>>;

export function defaultBindings(context: ShortcutContext): Bindings {
  return Object.fromEntries(shortcutsIn(context).map((a) => [a.id, a.defaultKey]));
}

/** A key spec taken apart: the lower-case modifier names as written, and the key as written. */
export function parseKeySpec(spec: string): { mods: Set<string>; key: string } {
  // A bare "+" key ends the spec ("Ctrl++"); it would otherwise split into empty parts.
  const pieces = spec.endsWith("++") ? [...spec.slice(0, -2).split("+").filter(Boolean), "+"] : spec.split("+");
  return { mods: new Set(pieces.slice(0, -1).map((p) => p.toLowerCase())), key: pieces[pieces.length - 1] ?? "" };
}

/** A comparison form of a key spec: lower case, modifiers in the fixed order Ctrl, Alt, Shift. */
export function normalizeKeySpec(spec: string): string {
  const { mods, key } = parseKeySpec(spec);
  return [mods.has("ctrl") ? "ctrl" : "", mods.has("alt") ? "alt" : "", mods.has("shift") ? "shift" : "", key.toLowerCase()]
    .filter(Boolean)
    .join("+");
}

/** A key spec as the UI prints it: "A", "Esc", "Ctrl+Delete". */
export function formatKeySpec(spec: string): string {
  return spec
    .split("+")
    .map((part) => (part === "Escape" ? "Esc" : part.length === 1 ? part.toUpperCase() : part))
    .join("+");
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;

/**
 * The action a key event triggers under `bindings`, or null. Meta (Windows key) never matches.
 * With `ignoreCtrlAlt`, a binding that names neither Ctrl nor Alt also matches while they are held
 * (the capture overlay's Space and M always worked that way); an exact match still wins.
 */
export function actionForKeyEvent(event: KeyEventLike, bindings: Bindings, options: { ignoreCtrlAlt?: boolean } = {}): string | null {
  if (event.metaKey) return null;
  const pressed = event.key === "+" ? "=" : event.key === " " ? "space" : event.key.toLowerCase();
  // Bindings that spell Shift out are tried first, so Ctrl+Shift+K is never shadowed by a plain Ctrl+K
  // (which also matches with Shift held) whatever order the bindings were built in.
  const candidates = Object.entries(bindings).map(([action, spec]) => {
    const { mods, key } = parseKeySpec(spec);
    return { action, key: key.toLowerCase(), ctrl: mods.has("ctrl"), alt: mods.has("alt"), shift: mods.has("shift") };
  });
  candidates.sort((a, b) => Number(b.shift) - Number(a.shift));
  const find = (loose: boolean) =>
    candidates.find((c) => {
      if (c.key !== pressed) return false;
      if (loose ? c.ctrl || c.alt : c.ctrl !== event.ctrlKey || c.alt !== event.altKey) return false;
      // Shift is part of typing a capital or a symbol (Ctrl+Shift+= makes "+"), so only bindings that
      // spell Shift out are strict about it.
      return !c.shift || event.shiftKey;
    })?.action ?? null;
  return find(false) ?? (options.ignoreCtrlAlt ? find(true) : null);
}

/** The key as the UI prints it: "A", "Esc", "Ctrl+Delete". */
export function keyLabel(action: string, bindings: Bindings): string {
  return formatKeySpec(bindings[action] ?? "");
}
