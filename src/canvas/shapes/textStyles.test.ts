import { describe, expect, it } from "vitest";
import type { Font } from "../../core/propertyGroups";
import { runsToStyles, stylesToRuns, toCharStyle } from "./textStyles";

const base: Font = { size: 24, bold: false, italic: false, color: "#e02424", underline: false };

describe("runs to Fabric's per-line, per-character styles", () => {
  it("puts each styled character at its line and its place in the line (the newline counts as a character)", () => {
    // "ab\ncd": characters 0 1 | newline 2 | 3 4
    const styles = runsToStyles([{ from: 1, to: 5, font: { bold: true } }], "ab\ncd");
    expect(styles).toEqual({
      0: { 1: { fontWeight: "bold" } },
      1: { 0: { fontWeight: "bold" }, 1: { fontWeight: "bold" } },
    });
  });

  it("names every property the way Fabric does", () => {
    expect(toCharStyle({ size: 40, bold: true, italic: true, underline: true, color: "#00ff00" })).toEqual({
      fontSize: 40,
      fontWeight: "bold",
      fontStyle: "italic",
      underline: true,
      fill: "#00ff00",
    });
    expect(toCharStyle({ bold: false, italic: false })).toEqual({ fontWeight: "normal", fontStyle: "normal" });
  });

  it("is empty for no runs", () => {
    expect(runsToStyles([], "abc")).toEqual({});
  });
});

describe("Fabric's styles back to runs", () => {
  it("reads the model's runs back from what it made (a round trip)", () => {
    const runs = [
      { from: 0, to: 2, font: { bold: true, size: 40 } },
      { from: 3, to: 5, font: { bold: true, size: 40 } },
      { from: 6, to: 7, font: { color: "#00ff00" } },
    ];
    expect(stylesToRuns(runsToStyles(runs, "ab\ncd\nef"), "ab\ncd\nef", base)).toEqual(runs);
  });

  it("drops what equals the box's own look and what is past the text (Fabric keeps styles of deleted letters for a moment)", () => {
    const styles = {
      0: { 0: { fontSize: 24, fontWeight: "normal", fill: "#e02424" }, 1: { fontWeight: "bold" }, 9: { fontWeight: "bold" } },
      4: { 0: { fontWeight: "bold" } },
    };
    expect(stylesToRuns(styles, "ab", base)).toEqual([{ from: 1, to: 2, font: { bold: true } }]);
  });

  it("keeps a style that differs from the box's, such as not bold in a bold box", () => {
    expect(stylesToRuns({ 0: { 0: { fontWeight: "normal" } } }, "ab", { ...base, bold: true })).toEqual([
      { from: 0, to: 1, font: { bold: false } },
    ]);
  });
});
