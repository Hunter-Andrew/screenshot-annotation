// @vitest-environment node
import { describe, expect, it } from "vitest";
import { actionForKeyEvent, defaultBindings, keyLabel, SHORTCUT_REGISTRY, shortcutsIn, type ShortcutContext } from "./shortcutRegistry";

const key = (k: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
  metaKey: false,
});

const CONTEXTS: ShortcutContext[] = ["overlay", "editor", "drawing"];

// Ticket 28 decision 8, written out independently of the registry.
const FIXED_KEYS = ["escape", "ctrl+z", "ctrl+y", "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+a", "delete", "backspace", "enter", "tab", "arrowup", "arrowdown", "arrowleft", "arrowright"];

// Ticket 41 decision 4 / ticket 54: Arrow, Rectangle, Pen, Highlighter.
const DRAWING_MODE_KEYS = ["A", "R", "P", "H", "E"];

// Also fixed (2026-11-19): Line, Ellipse, Text, Callout, Blur, Crop, Bring forward, Send back.
const OTHER_FIXED_IDS = ["tool.line", "tool.ellipse", "tool.text", "tool.textbox", "tool.callout", "tool.blur", "tool.crop", "editor.bringForward", "editor.sendBack"];

describe("the shortcut registry", () => {
  it("gives every action a unique id, a label and a context", () => {
    const ids = SHORTCUT_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of SHORTCUT_REGISTRY) {
      expect(a.label).not.toBe("");
      expect(CONTEXTS).toContain(a.context);
    }
  });

  it("never gives two actions the same default binding within one context", () => {
    for (const context of CONTEXTS) {
      const keys = shortcutsIn(context).map((a) => a.defaultKey.toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("lists the capture overlay keys: Space, M and the fixed Esc", () => {
    const overlay = Object.fromEntries(shortcutsIn("overlay").map((a) => [a.id, a]));
    expect(overlay["overlay.monitor"]).toMatchObject({ defaultKey: "Space", remappable: true });
    expect(overlay["overlay.magnifier"]).toMatchObject({ defaultKey: "M", remappable: true });
    expect(overlay["overlay.cancel"]).toMatchObject({ defaultKey: "Escape", remappable: false });
  });

  it("marks every decision-8 fixed key and the four drawing-mode tool keys (ticket 54) as not remappable, and nothing else", () => {
    for (const a of SHORTCUT_REGISTRY) {
      expect(a.remappable, a.id).toBe(!FIXED_KEYS.includes(a.defaultKey.toLowerCase()) && !DRAWING_MODE_KEYS.includes(a.defaultKey) && !OTHER_FIXED_IDS.includes(a.id));
    }
    const fixedIds = SHORTCUT_REGISTRY.filter((a) => !a.remappable).map((a) => a.id).sort();
    expect(fixedIds).toEqual(["drawing.arrow", "drawing.eraser", "drawing.exit", "drawing.highlight", "drawing.pen", "drawing.rect", "drawing.redo", "drawing.undo", "editor.copy", "editor.delete", "editor.deleteBackspace", "editor.deselect", "editor.redo", "editor.undo", "overlay.cancel", "tool.arrow", "tool.highlight", "tool.pen", "tool.rect", ...OTHER_FIXED_IDS].sort());
  });
});

describe("the Drawing mode rows (ticket 53)", () => {
  it("are A, R, P, H, E, Ctrl+Z, Ctrl+Y and Esc, all fixed", () => {
    expect(shortcutsIn("drawing").map((a) => [a.defaultKey, a.remappable])).toEqual([
      ["A", false], ["R", false], ["P", false], ["H", false], ["E", false], ["Ctrl+Z", false], ["Ctrl+Y", false], ["Escape", false],
    ]);
  });
});

describe("reading keys from the registry", () => {
  it("resolves overlay keys in the overlay context only", () => {
    const overlay = defaultBindings("overlay");
    expect(actionForKeyEvent(key(" "), overlay)).toBe("overlay.monitor");
    expect(actionForKeyEvent(key("m"), overlay)).toBe("overlay.magnifier");
    expect(actionForKeyEvent(key("M", { shift: true }), overlay)).toBe("overlay.magnifier");
    expect(actionForKeyEvent(key("Escape"), overlay)).toBe("overlay.cancel");
    expect(actionForKeyEvent(key("v"), overlay)).toBeNull();
    expect(actionForKeyEvent(key("Escape"), defaultBindings("editor"))).toBe("editor.deselect");
  });

  it("can ignore Ctrl and Alt for bare-key bindings, but keeps exact matching otherwise", () => {
    const overlay = defaultBindings("overlay");
    const loose = { ignoreCtrlAlt: true };
    expect(actionForKeyEvent(key(" ", { ctrl: true }), overlay)).toBeNull();
    expect(actionForKeyEvent(key(" ", { ctrl: true }), overlay, loose)).toBe("overlay.monitor");
    expect(actionForKeyEvent(key("m", { alt: true }), overlay, loose)).toBe("overlay.magnifier");
    // A binding that spells Ctrl out still means exactly that, and wins over a looser bare key.
    const remapped = { ...overlay, "overlay.magnifier": "Ctrl+M", "overlay.monitor": "M" };
    expect(actionForKeyEvent(key("m", { ctrl: true }), remapped, loose)).toBe("overlay.magnifier");
    expect(actionForKeyEvent(key("m"), remapped, loose)).toBe("overlay.monitor");
    expect(actionForKeyEvent(key("m", { alt: true }), remapped, loose)).toBe("overlay.monitor");
  });

  it("prints keys for display", () => {
    const overlay = defaultBindings("overlay");
    expect(keyLabel("overlay.monitor", overlay)).toBe("Space");
    expect(keyLabel("overlay.cancel", overlay)).toBe("Esc");
  });
});
