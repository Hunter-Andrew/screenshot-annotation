import { describe, expect, it } from "vitest";
import { actionForKeyEvent } from "./shortcutRegistry";
import { resolveBindings, specFromKeyEvent, validateBinding, validateReset, validOverrides } from "./shortcutBindings";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("specFromKeyEvent", () => {
  it("names a bare letter in capitals and Space as Space", () => {
    expect(specFromKeyEvent(key("n"))).toEqual({ kind: "spec", spec: "N" });
    expect(specFromKeyEvent(key(" "))).toEqual({ kind: "spec", spec: "Space" });
  });
  it("lists modifiers in the order Ctrl, Alt, Shift", () => {
    expect(specFromKeyEvent(key("k", { shiftKey: true, ctrlKey: true }))).toEqual({ kind: "spec", spec: "Ctrl+Shift+K" });
    expect(specFromKeyEvent(key("F5", { altKey: true, shiftKey: true }))).toEqual({ kind: "spec", spec: "Alt+Shift+F5" });
  });
  it("waits while only a modifier is down", () => {
    expect(specFromKeyEvent(key("Control", { ctrlKey: true }))).toEqual({ kind: "pending" });
    expect(specFromKeyEvent(key("Shift", { shiftKey: true }))).toEqual({ kind: "pending" });
  });
  it("refuses a lone Windows key with the Windows-key message, not the modifier one", () => {
    for (const k of ["Meta", "OS"]) {
      const r = specFromKeyEvent(key(k, { metaKey: true }));
      expect(r).toMatchObject({ kind: "refused" });
      expect((r as { message: string }).message).toMatch(/Windows key/);
    }
  });
  it("treats Escape as cancel", () => {
    expect(specFromKeyEvent(key("Escape"))).toEqual({ kind: "cancel" });
  });
  it("refuses the Windows key, naming the reason", () => {
    const r = specFromKeyEvent(key("k", { metaKey: true }));
    expect(r).toMatchObject({ kind: "refused" });
    expect((r as { message: string }).message).toMatch(/Windows key/);
  });
  it("refuses Print Screen outside the capture hotkey, saying where it works", () => {
    const r = specFromKeyEvent(key("PrintScreen"));
    expect(r).toMatchObject({ kind: "refused" });
    expect((r as { message: string }).message).toMatch(/Print Screen.*capture hotkey/);
  });
  it("records a typed plus as the = key so it matches like the zoom keys do", () => {
    expect(specFromKeyEvent(key("+", { ctrlKey: true, shiftKey: true }))).toEqual({ kind: "spec", spec: "Ctrl+Shift+=" });
  });
});

describe("validateBinding", () => {
  it("accepts a free bare key and a free Ctrl combination", () => {
    expect(validateBinding("overlay.magnifier", "N", {})).toEqual({ ok: true });
    expect(validateBinding("tool.ellipse", "Ctrl+K", {})).toEqual({ ok: true });
  });
  it("refuses a modifier-only spec", () => {
    const r = validateBinding("tool.ellipse", "Ctrl+Shift", {});
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/modifier/i);
  });
  it("refuses Windows-key and Print Screen specs", () => {
    expect(validateBinding("tool.ellipse", "Win+K", {}).ok).toBe(false);
    expect(validateBinding("tool.ellipse", "Meta+K", {}).ok).toBe(false);
    const ps = validateBinding("tool.ellipse", "PrintScreen", {});
    expect(ps.ok === false && ps.message).toMatch(/Print Screen/);
  });
  it("refuses every fixed key, and says it is fixed", () => {
    for (const fixed of ["Escape", "Ctrl+Z", "Ctrl+Y", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A", "Delete", "Backspace", "Enter", "Tab", "ArrowLeft", "ArrowUp"]) {
      const r = validateBinding("tool.ellipse", fixed, {});
      expect(r.ok, fixed).toBe(false);
      expect(r.ok === false && r.message, fixed).toMatch(/fixed|reserved/i);
    }
  });
  it("refuses a key another action in the same context uses, naming that action", () => {
    const r = validateBinding("tool.ellipse", "L", {});
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain("Line");
  });
  it("sees a clash with another action's override, not only its default", () => {
    const r = validateBinding("tool.ellipse", "K", { "tool.line": "K" });
    expect(r.ok === false && r.message).toContain("Line");
    // The line tool gave up L, so Ellipse may take it.
    expect(validateBinding("tool.ellipse", "L", { "tool.line": "K" })).toEqual({ ok: true });
  });
  it("allows the same key in the other context (M in the editor is fine)", () => {
    expect(validateBinding("tool.ellipse", "M", {})).toEqual({ ok: true });
    expect(validateBinding("overlay.magnifier", "A", {})).toEqual({ ok: true });
  });
  it("refuses an action that may not be remapped, and an unknown id", () => {
    expect(validateBinding("editor.undo", "K", {}).ok).toBe(false);
    expect(validateBinding("nope.nothing", "K", {}).ok).toBe(false);
  });
  it("lets an action keep its own current key", () => {
    expect(validateBinding("tool.ellipse", "E", {})).toEqual({ ok: true });
  });
});

describe("resolveBindings", () => {
  it("returns the defaults with no overrides", () => {
    expect(resolveBindings("overlay", {})).toEqual({ "overlay.cancel": "Escape", "overlay.monitor": "Space", "overlay.magnifier": "M" });
  });
  it("applies a valid override, and the key event then matches the new key only", () => {
    const b = resolveBindings("overlay", { "overlay.magnifier": "N" });
    expect(actionForKeyEvent(key("n"), b)).toBe("overlay.magnifier");
    expect(actionForKeyEvent(key("m"), b)).toBeNull();
  });
  it("ignores unknown ids, non-strings, fixed actions, other-context-irrelevant entries", () => {
    const b = resolveBindings("editor", { "nope.x": "K", "tool.ellipse": 5, "editor.undo": "K", "overlay.magnifier": "K" });
    expect(b["tool.ellipse"]).toBe("E");
    expect(b["editor.undo"]).toBe("Ctrl+Z");
    expect(Object.values(b)).not.toContain("K");
  });
  it("falls back to the default for an invalid key (modifier-only, Print Screen, Windows key, reserved)", () => {
    const b = resolveBindings("editor", { "tool.ellipse": "Ctrl", "tool.line": "PrintScreen", "tool.text": "Win+T", "tool.callout": "Enter" });
    expect([b["tool.ellipse"], b["tool.line"], b["tool.text"], b["tool.callout"]]).toEqual(["E", "L", "T", "O"]);
  });
  it("never lets a hand-edited clash through: the later action keeps its default", () => {
    const b = resolveBindings("editor", { "tool.line": "K", "tool.ellipse": "K" });
    expect(b["tool.line"]).toBe("K");
    expect(b["tool.ellipse"]).toBe("E");
  });
  it("rejects an override that lands on another action's untouched default", () => {
    const b = resolveBindings("editor", { "tool.ellipse": "L" });
    expect(b["tool.ellipse"]).toBe("E");
  });
  it("takes a non-object as no overrides", () => {
    expect(resolveBindings("overlay", 5 as unknown as Record<string, unknown>)["overlay.magnifier"]).toBe("M");
    expect(resolveBindings("overlay", null as unknown as Record<string, unknown>)["overlay.magnifier"]).toBe("M");
  });
});

describe("the fixed drawing-mode tool keys (ticket 54)", () => {
  const FIXED_TOOLS: Record<string, string> = { "tool.arrow": "A", "tool.rect": "R", "tool.pen": "P", "tool.highlight": "H" };
  it("ignores a stale saved override for them, whatever its value", () => {
    const b = resolveBindings("editor", { "tool.arrow": "K", "tool.rect": "Ctrl+K", "tool.pen": "J", "tool.highlight": "Alt+J" });
    for (const [id, key] of Object.entries(FIXED_TOOLS)) expect(b[id], id).toBe(key);
  });
  it("does not keep them in the overrides worth saving", () => {
    expect(validOverrides({ "tool.arrow": "K", "tool.pen": "J", "tool.line": "K" })).toEqual({ "tool.line": "K" });
  });
  it("refuses to remap them, and refuses another action taking their key", () => {
    expect(validateBinding("tool.arrow", "K", {}).ok).toBe(false);
    const r = validateBinding("tool.ellipse", "A", {});
    expect(r.ok === false && r.message).toContain("Arrow");
  });
  it("does not let a stale override free a fixed key for another action", () => {
    const b = resolveBindings("editor", { "tool.arrow": "K", "tool.ellipse": "A" });
    expect(b["tool.arrow"]).toBe("A");
    expect(b["tool.ellipse"]).toBe("E");
  });
});

describe("validateReset", () => {
  it("allows resetting when the default key is free", () => {
    expect(validateReset("tool.ellipse", { "tool.ellipse": "K" })).toEqual({ ok: true });
  });
  it("is refused when another action took the default key, naming it", () => {
    const r = validateReset("tool.ellipse", { "tool.ellipse": "K", "tool.text": "E" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain("Text");
  });
});

describe("validOverrides", () => {
  it("keeps only valid entries that differ from the default", () => {
    expect(validOverrides({ "overlay.magnifier": "N", "overlay.monitor": "Space", "tool.ellipse": "Ctrl", "x.y": "K" })).toEqual({ "overlay.magnifier": "N" });
  });
});

describe("a binding that spells out Shift", () => {
  it("wins over a plain binding of the same key when Shift is held", () => {
    // Ctrl+Shift+K must not be shadowed by Ctrl+K just because of registry order.
    const bindings = { "tool.arrow": "Ctrl+K", "tool.line": "Ctrl+Shift+K" };
    expect(actionForKeyEvent(key("k", { ctrlKey: true, shiftKey: true }), bindings)).toBe("tool.line");
    expect(actionForKeyEvent(key("k", { ctrlKey: true }), bindings)).toBe("tool.arrow");
  });
});
