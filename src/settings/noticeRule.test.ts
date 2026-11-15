import { describe, expect, it } from "vitest";
import { shouldWarnPrintScreenTaken, shouldShowPrintScreenNotice } from "./noticeRule";

describe("shouldShowPrintScreenNotice", () => {
  it("shows when Print Screen still opens Snipping Tool and the notice was not answered yet", () => {
    expect(shouldShowPrintScreenNotice({ snippingEnabled: true, dismissed: false })).toBe(true);
  });

  it("never shows again once answered", () => {
    expect(shouldShowPrintScreenNotice({ snippingEnabled: true, dismissed: true })).toBe(false);
  });

  it("does not show when Windows is already set to leave Print Screen alone", () => {
    expect(shouldShowPrintScreenNotice({ snippingEnabled: false, dismissed: false })).toBe(false);
  });
});

describe("shouldWarnPrintScreenTaken", () => {
  it("warns for Print Screen alone, or with modifiers, while Windows gives the key to Snipping Tool", () => {
    for (const accelerator of ["PrintScreen", "ctrl+PrintScreen", "ctrl+alt+shift+PrintScreen"]) {
      expect(shouldWarnPrintScreenTaken(accelerator, true)).toBe(true);
    }
  });

  it("stays quiet once the Windows setting is off", () => {
    expect(shouldWarnPrintScreenTaken("PrintScreen", false)).toBe(false);
  });

  it("stays quiet for any other hotkey, and before the hotkey is known", () => {
    expect(shouldWarnPrintScreenTaken("ctrl+shift+s", true)).toBe(false);
    expect(shouldWarnPrintScreenTaken(null, true)).toBe(false);
  });
});
