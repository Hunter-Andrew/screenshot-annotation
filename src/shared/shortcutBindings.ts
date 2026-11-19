// Remapping rules for the shortcut registry (ticket 47, decisions in ticket 28): what key a user may
// give an action, how a pressed key becomes a key spec, and how the stored overrides become the
// bindings the overlay and the editor use. Pure functions: nothing here reads or writes settings.
//
// A key spec is the registry's text form: modifiers in the order Ctrl, Alt, Shift, then the key
// ("N", "Ctrl+Shift+K", "Space", "Ctrl+Delete").

import {
  CONTEXT_NAME,
  defaultBindings,
  formatKeySpec,
  normalizeKeySpec,
  parseKeySpec,
  SHORTCUT_REGISTRY,
  shortcutsIn,
  type Bindings,
  type ShortcutAction,
  type ShortcutContext,
} from "./shortcutRegistry";

/** Overrides as stored in settings.json: unchecked, so every value is `unknown`. */
export type StoredOverrides = Readonly<Record<string, unknown>>;

export type Validation = { ok: true } | { ok: false; message: string };

const NO_SUCH_SHORTCUT = "That shortcut does not exist.";
const WINDOWS_KEY_REFUSAL = "Shortcuts with the Windows key are not allowed.";
const PRINT_SCREEN_REFUSAL = "Print Screen only works as the capture hotkey; pick another key here.";
/** What the recorder says when a modifier was pressed and released alone. */
export const MODIFIER_ALONE_REFUSAL = "A shortcut needs a key besides Ctrl, Alt or Shift: a modifier alone cannot be a shortcut.";

const MODIFIER_KEYS = new Set(["control", "alt", "shift", "altgraph"]);
const MODIFIER_NAMES = new Set(["ctrl", "alt", "shift"]);
const WINDOWS_NAMES = new Set(["win", "windows", "meta", "super", "cmd", "os"]);

/** Ticket 28 decision 8: keys that can never be assigned to another action (Esc, copy/paste, undo, editing, arrows). */
const RESERVED_SPECS = ["Escape", "Ctrl+Z", "Ctrl+Y", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A", "Delete", "Backspace", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const RESERVED = new Set(RESERVED_SPECS.map(normalizeKeySpec));

/** What each reserved key does, in the words Settings shows beside it (only keys with no registry row need one). */
const RESERVED_LABELS: Readonly<Record<string, string>> = {
  "Ctrl+V": "Paste",
  "Ctrl+X": "Cut",
  "Ctrl+A": "Select all",
  Enter: "New line in text",
  Tab: "Move between controls",
  ArrowUp: "Move the cursor up",
  ArrowDown: "Move the cursor down",
  ArrowLeft: "Move the cursor left",
  ArrowRight: "Move the cursor right",
};

/**
 * The reserved keys that no registry row shows (paste, cut, select all, Enter, Tab, the arrows), each with
 * what it does: Settings lists them read-only so the whole fixed set of decision 8 is visible.
 */
export function reservedKeysWithoutAction(): { spec: string; label: string }[] {
  const shown = new Set(SHORTCUT_REGISTRY.map((a) => normalizeKeySpec(a.defaultKey)));
  return RESERVED_SPECS.filter((spec) => !shown.has(normalizeKeySpec(spec))).map((spec) => ({ spec, label: RESERVED_LABELS[spec] ?? spec }));
}

function actionById(id: string): ShortcutAction | undefined {
  return SHORTCUT_REGISTRY.find((a) => a.id === id);
}

/** The key `action` holds under `overrides`: its stored override when it may be remapped and has a text one, else its default. */
function currentKey(action: ShortcutAction, overrides: StoredOverrides): string {
  const value = overrides[action.id];
  return typeof value === "string" && action.remappable ? value : action.defaultKey;
}

function shapeProblem(spec: string): string | null {
  const { mods, key } = parseKeySpec(spec);
  if (key === "" || MODIFIER_NAMES.has(key.toLowerCase()) || WINDOWS_NAMES.has(key.toLowerCase())) {
    return WINDOWS_NAMES.has(key.toLowerCase()) ? WINDOWS_KEY_REFUSAL : MODIFIER_ALONE_REFUSAL;
  }
  for (const m of mods) {
    if (WINDOWS_NAMES.has(m)) return WINDOWS_KEY_REFUSAL;
    if (!MODIFIER_NAMES.has(m)) return `"${m}" is not a modifier key.`;
  }
  if (key.toLowerCase() === "printscreen") return PRINT_SCREEN_REFUSAL;
  return null;
}

/**
 * Whether `spec` may be given to `actionId` when the user's current overrides are `overrides`
 * (assumed already valid). Refusals carry a message saying why, naming the clashing action.
 */
export function validateBinding(actionId: string, spec: string, overrides: StoredOverrides): Validation {
  const action = actionById(actionId);
  if (!action) return { ok: false, message: NO_SUCH_SHORTCUT };
  if (!action.remappable) return { ok: false, message: `${action.label} is a fixed shortcut and cannot be changed.` };
  const shape = shapeProblem(spec);
  if (shape) return { ok: false, message: shape };
  const wanted = normalizeKeySpec(spec);
  if (RESERVED.has(wanted)) return { ok: false, message: `${formatKeySpec(spec)} is a fixed key in this app (reserved) and cannot be assigned to another action.` };
  for (const other of shortcutsIn(action.context)) {
    if (other.id === action.id) continue;
    if (normalizeKeySpec(currentKey(other, overrides)) === wanted) {
      return { ok: false, message: `${formatKeySpec(spec)} is already used by "${other.label}" in ${CONTEXT_NAME[action.context]}. Change that one first.` };
    }
  }
  return { ok: true };
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;

export type RecordedKey =
  | { kind: "spec"; spec: string }
  | { kind: "pending" }
  | { kind: "cancel" }
  | { kind: "refused"; message: string };

/** What a key press means to the recorder: a spec, still waiting (only a modifier so far), Esc to cancel, or a refusal. */
export function specFromKeyEvent(event: KeyEventLike): RecordedKey {
  if (event.key === "Escape") return { kind: "cancel" };
  // The Windows key alone is "Meta" (or "OS" in older engines): say so, not that a modifier is missing a key.
  if (WINDOWS_NAMES.has(event.key.toLowerCase()) || event.metaKey) return { kind: "refused", message: WINDOWS_KEY_REFUSAL };
  if (MODIFIER_KEYS.has(event.key.toLowerCase())) return { kind: "pending" };
  if (event.key === "PrintScreen") return { kind: "refused", message: PRINT_SCREEN_REFUSAL };
  const name = event.key === " " ? "Space" : event.key === "+" ? "=" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const spec = [event.ctrlKey ? "Ctrl" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", name].filter(Boolean).join("+");
  return { kind: "spec", spec };
}

/**
 * The bindings for one context: each action's default, replaced by its stored override when that
 * override is valid. A missing, unknown, non-text or invalid entry (including a hand-edited clash:
 * the earlier action in registry order wins) is ignored and the default stays.
 */
export function resolveBindings(context: ShortcutContext, stored: StoredOverrides | null | undefined): Bindings {
  const raw = stored !== null && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const accepted: Record<string, string> = {};
  for (const action of shortcutsIn(context)) {
    const value = raw[action.id];
    if (!action.remappable || typeof value !== "string") continue;
    if (normalizeKeySpec(value) === normalizeKeySpec(action.defaultKey)) continue;
    if (validateBinding(action.id, value, accepted).ok) accepted[action.id] = value;
  }
  return { ...defaultBindings(context), ...accepted };
}

/** Every valid override across both contexts: what is worth keeping in settings.json. */
export function validOverrides(stored: StoredOverrides | null | undefined): Record<string, string> {
  const both = { ...resolveBindings("overlay", stored), ...resolveBindings("editor", stored) };
  const defaults = { ...defaultBindings("overlay"), ...defaultBindings("editor") };
  return Object.fromEntries(Object.entries(both).filter(([id, spec]) => spec !== defaults[id]));
}

/**
 * Whether `actionId` may go back to its default now. Refused (never a silent swap) when another
 * action currently holds that key.
 */
export function validateReset(actionId: string, overrides: StoredOverrides): Validation {
  const action = actionById(actionId);
  if (!action) return { ok: false, message: NO_SUCH_SHORTCUT };
  const { [actionId]: _drop, ...rest } = overrides;
  void _drop;
  for (const other of shortcutsIn(action.context)) {
    if (other.id === action.id) continue;
    if (normalizeKeySpec(currentKey(other, rest)) === normalizeKeySpec(action.defaultKey)) {
      return { ok: false, message: `${formatKeySpec(action.defaultKey)} is now used by "${other.label}" in ${CONTEXT_NAME[action.context]}. Change that one first, then reset this.` };
    }
  }
  return { ok: true };
}
