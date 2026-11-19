/**
 * Pure key-combination logic for the hotkey recorder: a KeyboardEvent becomes the accelerator string
 * the backend registers (the format of tauri-plugin-global-shortcut, e.g. "ctrl+shift+s" or
 * "PrintScreen"), and an accelerator becomes the text shown to the user.
 */

export interface KeyEventLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export type ComboResult =
  | { kind: "combo"; accelerator: string }
  /** Only modifiers are down so far; keep listening. */
  | { kind: "pending" }
  | { kind: "cancel" }
  | { kind: "invalid"; reason: "needs-modifier" | "unsupported-key" };

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta)(Left|Right)$/;

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.test(code);
}

const NAMED_KEYS = new Set([
  "PrintScreen",
  "Space",
  "Insert",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

/** The key part of the accelerator for a `KeyboardEvent.code`, or null when we cannot register it. */
function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_KEYS.has(code) ? code : null;
}

/** Keys that may be bound with no modifier. */
const allowedBare = (code: string) => code === "PrintScreen" || /^F\d+$/.test(code);

export function comboFromKeyEvent(e: KeyEventLike): ComboResult {
  if (e.code === "Escape") return { kind: "cancel" };
  if (isModifierCode(e.code)) return { kind: "pending" };
  const key = keyName(e.code);
  if (key === null) return { kind: "invalid", reason: "unsupported-key" };
  const mods = [e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift", e.metaKey && "super"].filter(
    (m): m is string => m !== false,
  );
  if (mods.length === 0 && !allowedBare(e.code)) return { kind: "invalid", reason: "needs-modifier" };
  return { kind: "combo", accelerator: [...mods, key].join("+") };
}

const MODIFIER_LABELS: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", super: "Win" };

export function formatCombo(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => {
      if (MODIFIER_LABELS[part]) return MODIFIER_LABELS[part];
      if (part === "PrintScreen") return "Print Screen";
      if (part.startsWith("Arrow")) return part.slice(5);
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("+");
}

/** Whether the accelerator is exactly Print Screen, no modifiers (the one hotkey the backend watches via Raw Input). */
export function isBarePrintScreen(accelerator: string): boolean {
  return accelerator === "PrintScreen";
}

/** Whether the key part of an accelerator is Print Screen (alone or with modifiers). */
export function usesPrintScreen(accelerator: string): boolean {
  return accelerator.split("+").pop() === "PrintScreen";
}

/** Why a demo-tool hotkey (laser pointer, drawing mode) cannot take `accelerator`; null when it can. The backend applies the same rules (`hotkey::demo_refusal`). */
export type DemoRefusal = "print-screen" | "capture-hotkey" | "other-demo";

export function demoHotkeyRefusal(accelerator: string, capture: string, otherDemo: string): DemoRefusal | null {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (usesPrintScreen(accelerator)) return "print-screen";
  if (same(accelerator, capture)) return "capture-hotkey";
  if (same(accelerator, otherDemo)) return "other-demo";
  return null;
}
