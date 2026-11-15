import { describe, expect, it } from "vitest";
import { comboFromKeyEvent, formatCombo, isModifierCode, usesPrintScreen } from "./hotkey";

const ev = (
  code: string,
  mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {},
) => ({
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe("comboFromKeyEvent", () => {
  it("turns Ctrl+Shift+S into the accelerator the backend registers", () => {
    expect(comboFromKeyEvent(ev("KeyS", { ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "combo",
      accelerator: "ctrl+shift+s",
    });
  });

  it("orders modifiers ctrl, alt, shift, super whatever order they were pressed", () => {
    expect(
      comboFromKeyEvent(ev("Digit4", { metaKey: true, altKey: true, shiftKey: true, ctrlKey: true })),
    ).toEqual({ kind: "combo", accelerator: "ctrl+alt+shift+super+4" });
  });

  it("accepts Print Screen on its own, and function keys on their own", () => {
    expect(comboFromKeyEvent(ev("PrintScreen"))).toEqual({ kind: "combo", accelerator: "PrintScreen" });
    expect(comboFromKeyEvent(ev("F9"))).toEqual({ kind: "combo", accelerator: "F9" });
  });

  it("keeps Print Screen with modifiers", () => {
    expect(comboFromKeyEvent(ev("PrintScreen", { altKey: true }))).toEqual({
      kind: "combo",
      accelerator: "alt+PrintScreen",
    });
  });

  it("waits while only modifiers are held", () => {
    expect(comboFromKeyEvent(ev("ControlLeft", { ctrlKey: true }))).toEqual({ kind: "pending" });
    expect(comboFromKeyEvent(ev("ShiftRight", { shiftKey: true }))).toEqual({ kind: "pending" });
  });

  it("rejects a plain letter, which would steal typing everywhere", () => {
    expect(comboFromKeyEvent(ev("KeyS"))).toEqual({ kind: "invalid", reason: "needs-modifier" });
  });

  it("rejects keys the backend cannot register", () => {
    expect(comboFromKeyEvent(ev("MediaPlayPause", { ctrlKey: true }))).toEqual({
      kind: "invalid",
      reason: "unsupported-key",
    });
  });

  it("Escape cancels recording", () => {
    expect(comboFromKeyEvent(ev("Escape"))).toEqual({ kind: "cancel" });
  });
});

describe("formatCombo", () => {
  it("shows an accelerator the way a person reads it", () => {
    expect(formatCombo("ctrl+shift+s")).toBe("Ctrl+Shift+S");
    expect(formatCombo("PrintScreen")).toBe("Print Screen");
    expect(formatCombo("alt+PrintScreen")).toBe("Alt+Print Screen");
    expect(formatCombo("ctrl+super+4")).toBe("Ctrl+Win+4");
    expect(formatCombo("ctrl+alt+ArrowLeft")).toBe("Ctrl+Alt+Left");
  });
});

describe("isModifierCode", () => {
  it("recognises modifier keys", () => {
    expect(isModifierCode("MetaLeft")).toBe(true);
    expect(isModifierCode("KeyA")).toBe(false);
  });
});

describe("usesPrintScreen", () => {
  it("is true when the key part is Print Screen, with or without modifiers", () => {
    expect(usesPrintScreen("PrintScreen")).toBe(true);
    expect(usesPrintScreen("ctrl+shift+PrintScreen")).toBe(true);
  });

  it("is false for other keys, including ones whose names merely look similar", () => {
    expect(usesPrintScreen("ctrl+shift+s")).toBe(false);
    expect(usesPrintScreen("ctrl+Insert")).toBe(false);
    expect(usesPrintScreen("")).toBe(false);
  });

  it("matches what the recorder produces for the Print Screen key", () => {
    const e = { code: "PrintScreen", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false };
    const result = comboFromKeyEvent(e);
    expect(result.kind === "combo" && usesPrintScreen(result.accelerator)).toBe(true);
  });
});
