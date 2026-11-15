import { describe, expect, it } from "vitest";
import { shouldShowPrintScreenNotice } from "./printScreenNotice";

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
