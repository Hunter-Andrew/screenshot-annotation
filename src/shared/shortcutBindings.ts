// Remapping rules for the shortcut registry (ticket 47, decisions in ticket 28): what key a user may
// give an action, how a pressed key becomes a key spec, and how the stored overrides become the
// bindings the overlay and the editor use. Pure functions: nothing here reads or writes settings.
//
// A key spec is the registry's text form: modifiers in the order Ctrl, Alt, Shift, then the key
// ("N", "Ctrl+Shift+K", "Space", "Ctrl+Delete").

import { defaultBindings, SHORTCUT_REGISTRY, shortcutsIn, type Bindings, type ShortcutAction } from "./shortcutRegistry";

/** Overrides as stored in settings.json: unchecked, so every value is `unknown`. */
export type StoredOverrides = Readonly<Record<string, unknown>>;

export type Validation = { ok: true } | { ok: false; message: string };

const CONTEXT_NAME = { overlay: "Capture overlay", editor: "Editor" } as const;

const MODIFIER_KEYS = new Set(["control", "alt", "shift", "meta", "altgraph", "os"]);
const MODIFIER_NAMES = new Set(["ctrl", "alt", "shift"]);
const WINDOWS_NAMES = new Set(["win", "windows", "meta", "super", "cmd", "os"]);

/** Ticket 28 decision 8: keys that can never be assigned to another action (Esc, copy/paste, undo, editing, arrows). */
const RESERVED = new Set(
  ["Escape", "Ctrl+Z", "Ctrl+Y", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A", "Delete", "Backspace", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].map((s) => normalize(s)),
);

interface Parts {
  mods: Set<string>;
  key: string;
}

function parts(spec: string): Parts {
  const pieces = spec.endsWith("++") ? [...spec.slice(0, -2).split("+").filter(Boolean), "+"] : spec.split("+");
  const key = pieces[pieces.length - 1] ?? "";
  return { mods: new Set(pieces.slice(0, -1).map((p) => p.toLowerCase())), key };
}

/** A comparison form: lower case, modifiers in a fixed order. */
function normalize(spec: string): string {
  const { mods, key } = parts(spec);
  return [mods.has("ctrl") ? "ctrl" : "", mods.has("alt") ? "alt" : "", mods.has("shift") ? "shift" : "", key.toLowerCase()]
    .filter(Boolean)
    .join("+");
}

function actionById(id: string): ShortcutAction | undefined {
  return SHORTCUT_REGISTRY.find((a) => a.id === id);
}

/** The key spec text as the UI prints it in messages ("Ctrl+Shift+K"). */
function shown(spec: string): string {
  return spec
    .split("+")
    .map((part) => (part === "Escape" ? "Esc" : part.length === 1 ? part.toUpperCase() : part))
    .join("+");
}

function shapeProblem(spec: string): string | null {
  const { mods, key } = parts(spec);
  if (key === "" || MODIFIER_NAMES.has(key.toLowerCase()) || WINDOWS_NAMES.has(key.toLowerCase())) {
    return WINDOWS_NAMES.has(key.toLowerCase()) ? "Shortcuts with the Windows key are not allowed." : "A shortcut needs a key besides Ctrl, Alt or Shift: a modifier alone cannot be a shortcut.";
  }
  for (const m of mods) {
    if (WINDOWS_NAMES.has(m)) return "Shortcuts with the Windows key are not allowed.";
    if (!MODIFIER_NAMES.has(m)) return `"${m}" is not a modifier key.`;
  }
  if (key.toLowerCase() === "printscreen") return "Print Screen only works as the capture hotkey; pick another key here.";
  return null;
}

/**
 * Whether `spec` may be given to `actionId` when the user's current overrides are `overrides`
 * (assumed already valid). Refusals carry a message saying why, naming the clashing action.
 */
export function validateBinding(actionId: string, spec: string, overrides: StoredOverrides): Validation {
  const action = actionById(actionId);
  if (!action) return { ok: false, message: "That shortcut does not exist." };
  if (!action.remappable) return { ok: false, message: `${action.label} is a fixed shortcut and cannot be changed.` };
  const shape = shapeProblem(spec);
  if (shape) return { ok: false, message: shape };
  const wanted = normalize(spec);
  if (RESERVED.has(wanted)) return { ok: false, message: `${shown(spec)} is a fixed key in this app (reserved) and cannot be assigned to another action.` };
  for (const other of shortcutsIn(action.context)) {
    if (other.id === action.id) continue;
    const current = typeof overrides[other.id] === "string" && other.remappable ? (overrides[other.id] as string) : other.defaultKey;
    if (normalize(current) === wanted) {
      return { ok: false, message: `${shown(spec)} is already used by "${other.label}" in ${CONTEXT_NAME[action.context]}. Change that one first.` };
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
  if (MODIFIER_KEYS.has(event.key.toLowerCase())) return { kind: "pending" };
  if (event.metaKey) return { kind: "refused", message: "Shortcuts with the Windows key are not allowed." };
  if (event.key === "PrintScreen") return { kind: "refused", message: "Print Screen only works as the capture hotkey; pick another key here." };
  const name = event.key === " " ? "Space" : event.key === "+" ? "=" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const spec = [event.ctrlKey ? "Ctrl" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", name].filter(Boolean).join("+");
  return { kind: "spec", spec };
}

/**
 * The bindings for one context: each action's default, replaced by its stored override when that
 * override is valid. A missing, unknown, non-text or invalid entry (including a hand-edited clash:
 * the earlier action in registry order wins) is ignored and the default stays.
 */
export function resolveBindings(context: "overlay" | "editor", stored: StoredOverrides | null | undefined): Bindings {
  const raw = stored !== null && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const accepted: Record<string, string> = {};
  for (const action of shortcutsIn(context)) {
    const value = raw[action.id];
    if (!action.remappable || typeof value !== "string") continue;
    if (normalize(value) === normalize(action.defaultKey)) continue;
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
  if (!action) return { ok: false, message: "That shortcut does not exist." };
  const { [actionId]: _drop, ...rest } = overrides;
  void _drop;
  for (const other of shortcutsIn(action.context)) {
    if (other.id === action.id) continue;
    const current = typeof rest[other.id] === "string" && other.remappable ? (rest[other.id] as string) : other.defaultKey;
    if (normalize(current) === normalize(action.defaultKey)) {
      return { ok: false, message: `${shown(action.defaultKey)} is now used by "${other.label}" in ${CONTEXT_NAME[action.context]}. Change that one first, then reset this.` };
    }
  }
  return { ok: true };
}
