// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  actionForKeyEvent,
  allowedWhileTyping,
  defaultBindings,
  isTypingTarget,
  keyLabel,
  SHORTCUT_ACTIONS,
} from "./shortcuts";

const key = (k: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
  metaKey: !!mods.meta,
});

describe("the one shortcut table", () => {
  it("has every editor key Andrew validated in the layout prototype (ticket 04)", () => {
    const keys = Object.fromEntries(SHORTCUT_ACTIONS.map((a) => [a.id, a.defaultKey]));

    expect(keys).toMatchObject({
      "tool.select": "V",
      "tool.arrow": "A",
      "tool.line": "L",
      "tool.pen": "P",
      "tool.rect": "R",
      "tool.ellipse": "E",
      "tool.text": "T",
      "tool.callout": "O",
      "tool.highlight": "H",
      "tool.blur": "B",
      "tool.crop": "C",
      "editor.deselect": "Escape",
      "editor.copy": "Ctrl+C",
      "editor.discard": "Ctrl+Delete",
    });
  });

  it("gives every action an id, a label and a key, none of them twice", () => {
    const ids = SHORTCUT_ACTIONS.map((a) => a.id);
    const keys = SHORTCUT_ACTIONS.map((a) => a.defaultKey.toLowerCase());

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of SHORTCUT_ACTIONS) expect(a.label).not.toBe("");
  });
});

describe("actionForKeyEvent", () => {
  it("maps a bare letter to its tool, in either case", () => {
    expect(actionForKeyEvent(key("v"))).toBe("tool.select");
    expect(actionForKeyEvent(key("a"))).toBe("tool.arrow");
    expect(actionForKeyEvent(key("A", { shift: true }))).toBe("tool.arrow");
  });

  it("maps Escape, Ctrl+C and Ctrl+Delete to their actions", () => {
    expect(actionForKeyEvent(key("Escape"))).toBe("editor.deselect");
    expect(actionForKeyEvent(key("c", { ctrl: true }))).toBe("editor.copy");
    expect(actionForKeyEvent(key("Delete", { ctrl: true }))).toBe("editor.discard");
  });

  it("does not take a key with the wrong modifiers", () => {
    expect(actionForKeyEvent(key("Delete", { alt: true }))).toBeNull();
    expect(actionForKeyEvent(key("a", { ctrl: true }))).toBeNull();
    expect(actionForKeyEvent(key("a", { alt: true }))).toBeNull();
    expect(actionForKeyEvent(key("c"))).toBe("tool.crop");
    expect(actionForKeyEvent(key("z"))).toBeNull();
  });

  it("maps undo, both redo keys, delete (Delete and Backspace) and the stacking keys", () => {
    expect(actionForKeyEvent(key("z", { ctrl: true }))).toBe("editor.undo");
    expect(actionForKeyEvent(key("y", { ctrl: true }))).toBe("editor.redo");
    // Shift held makes the browser report "Z": that is redo, not undo.
    expect(actionForKeyEvent(key("Z", { ctrl: true, shift: true }))).toBe("editor.redoAlt");
    expect(actionForKeyEvent(key("Delete"))).toBe("editor.delete");
    expect(actionForKeyEvent(key("Backspace"))).toBe("editor.deleteBackspace");
    expect(actionForKeyEvent(key("]", { ctrl: true }))).toBe("editor.bringForward");
    expect(actionForKeyEvent(key("[", { ctrl: true }))).toBe("editor.sendBack");
  });

  it("keeps Delete and Backspace fixed (not remappable) and Ctrl+Delete as Discard", () => {
    const fixed = SHORTCUT_ACTIONS.filter((a) => a.fixed).map((a) => a.id);
    expect(fixed).toEqual(["editor.delete", "editor.deleteBackspace"]);
    expect(actionForKeyEvent(key("Delete", { ctrl: true }))).toBe("editor.discard");
  });

  it("reads zoom keys, taking + as =", () => {
    expect(actionForKeyEvent(key("0", { ctrl: true }))).toBe("view.fit");
    expect(actionForKeyEvent(key("1", { ctrl: true }))).toBe("view.actualSize");
    expect(actionForKeyEvent(key("=", { ctrl: true }))).toBe("view.zoomIn");
    expect(actionForKeyEvent(key("+", { ctrl: true, shift: true }))).toBe("view.zoomIn");
    expect(actionForKeyEvent(key("-", { ctrl: true }))).toBe("view.zoomOut");
  });

  it("follows a remapped binding instead of the default (what ticket 28 will build on)", () => {
    const bindings = { ...defaultBindings(), "tool.arrow": "X" };

    expect(actionForKeyEvent(key("x"), bindings)).toBe("tool.arrow");
    expect(actionForKeyEvent(key("a"), bindings)).toBeNull();
  });
});

describe("keyLabel", () => {
  it("shows the key as the tool column prints it", () => {
    expect(keyLabel("tool.arrow")).toBe("A");
    expect(keyLabel("editor.discard")).toBe("Ctrl+Delete");
    expect(keyLabel("tool.arrow", { ...defaultBindings(), "tool.arrow": "x" })).toBe("X");
  });
});

describe("isTypingTarget", () => {
  it("is true for text fields, so a typed letter never switches tools", () => {
    const el = (tag: string, extra: object = {}) => ({ tagName: tag, isContentEditable: false, ...extra });

    expect(isTypingTarget(el("INPUT", { type: "text" }) as never)).toBe(true);
    expect(isTypingTarget(el("TEXTAREA") as never)).toBe(true);
    expect(isTypingTarget(el("DIV", { isContentEditable: true }) as never)).toBe(true);
    expect(isTypingTarget(el("BUTTON") as never)).toBe(false);
    expect(isTypingTarget(el("INPUT", { type: "range" }) as never)).toBe(false);
    expect(isTypingTarget(el("INPUT", { type: "color" }) as never)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("keys while typing in a text field or the text box", () => {
  it("bare keys never act, so typing T, A or V does not switch tools", () => {
    for (const k of ["t", "a", "v", "Escape", "Delete"]) {
      expect(allowedWhileTyping(actionForKeyEvent(key(k)), key(k))).toBe(false);
    }
  });

  it("Ctrl view keys (zoom, fit) stay active", () => {
    for (const k of ["0", "1", "=", "-"]) {
      const action = actionForKeyEvent(key(k, { ctrl: true }));
      expect(action).toMatch(/^view\./);
      expect(allowedWhileTyping(action, key(k, { ctrl: true }))).toBe(true);
    }
  });

  it("Ctrl+C and Ctrl+Delete keep their text meaning (copy the selected words, delete a word)", () => {
    expect(allowedWhileTyping(actionForKeyEvent(key("c", { ctrl: true })), key("c", { ctrl: true }))).toBe(false);
    expect(allowedWhileTyping(actionForKeyEvent(key("Delete", { ctrl: true })), key("Delete", { ctrl: true }))).toBe(
      false,
    );
  });

  it("nothing acts when no action matched", () => {
    expect(allowedWhileTyping(null, key("x"))).toBe(false);
  });
});
