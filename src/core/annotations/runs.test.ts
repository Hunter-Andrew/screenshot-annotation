import { describe, expect, it } from "vitest";
import type { Font } from "../propertyGroups";
import { charCount, normalizeRuns, resetRunKeys, selectionFont, styleRange } from "./runs";

const base: Font = { size: 24, bold: false, italic: false, color: "#e02424", align: "left", valign: "top", underline: false };

describe("normalizeRuns", () => {
  it("keeps a valid run, sorted, and drops everything that is not a run", () => {
    const raw = [
      { from: 5, to: 8, font: { bold: true } },
      { from: 0, to: 2, font: { color: "#00ff00" } },
      "nonsense",
      null,
      { from: "a", to: 3, font: { bold: true } },
      { from: 1.5, to: 3, font: { bold: true } },
      { from: 3, to: 3, font: { bold: true } }, // empty
      { from: 4, to: 2, font: { bold: true } }, // backwards
      { from: -2, to: 1, font: {} }, // no style at all
    ];
    expect(normalizeRuns(raw, "0123456789")).toEqual([
      { from: 0, to: 2, font: { color: "#00ff00" } },
      { from: 5, to: 8, font: { bold: true } },
    ]);
  });

  it("is empty for anything that is not a list", () => {
    expect(normalizeRuns(undefined, "abc")).toEqual([]);
    expect(normalizeRuns({ from: 0, to: 1, font: { bold: true } }, "abc")).toEqual([]);
  });

  it("drops style values that are not valid and keeps the valid ones of the same run", () => {
    const raw = [{ from: 0, to: 3, font: { size: 3, bold: "yes", italic: true, color: "red", underline: 1, extra: 1 } }];
    expect(normalizeRuns(raw, "abcdef")).toEqual([{ from: 0, to: 3, font: { italic: true } }]);
    expect(normalizeRuns([{ from: 0, to: 3, font: { size: 300 } }], "abcdef")).toEqual([]);
    expect(normalizeRuns([{ from: 0, to: 3, font: { size: 30, color: "#AbCdEf" } }], "abcdef")).toEqual([
      { from: 0, to: 3, font: { size: 30, color: "#abcdef" } },
    ]);
  });

  it("clips to the text and drops what falls outside it", () => {
    const raw = [
      { from: 2, to: 99, font: { bold: true } },
      { from: 10, to: 12, font: { italic: true } },
    ];
    expect(normalizeRuns(raw, "abcd")).toEqual([{ from: 2, to: 4, font: { bold: true } }]);
    expect(normalizeRuns(raw, "")).toEqual([]);
  });

  it("splits overlaps: where runs overlap the later one wins per property", () => {
    const raw = [
      { from: 0, to: 6, font: { bold: true, color: "#111111" } },
      { from: 2, to: 4, font: { color: "#222222" } },
    ];
    expect(normalizeRuns(raw, "abcdefgh")).toEqual([
      { from: 0, to: 2, font: { bold: true, color: "#111111" } },
      { from: 2, to: 4, font: { bold: true, color: "#222222" } },
      { from: 4, to: 6, font: { bold: true, color: "#111111" } },
    ]);
  });

  it("merges neighbours that style the same way", () => {
    const raw = [
      { from: 0, to: 2, font: { bold: true } },
      { from: 2, to: 5, font: { bold: true } },
      { from: 5, to: 6, font: { italic: true } },
    ];
    expect(normalizeRuns(raw, "abcdefg")).toEqual([
      { from: 0, to: 5, font: { bold: true } },
      { from: 5, to: 6, font: { italic: true } },
    ]);
  });

  it("leaves out the newline characters, so a range over two lines is one run per line", () => {
    // "ab\ncd": the newline is character 2
    expect(normalizeRuns([{ from: 0, to: 5, font: { bold: true } }], "ab\ncd")).toEqual([
      { from: 0, to: 2, font: { bold: true } },
      { from: 3, to: 5, font: { bold: true } },
    ]);
  });

  it("counts characters as graphemes, so an emoji with a modifier is one character", () => {
    const text = "a👍🏽b"; // 4 UTF-16 code units for the thumb, but one character
    expect(charCount(text)).toBe(3);
    expect(normalizeRuns([{ from: 1, to: 2, font: { bold: true } }], text)).toEqual([{ from: 1, to: 2, font: { bold: true } }]);
    expect(normalizeRuns([{ from: 2, to: 9, font: { bold: true } }], text)).toEqual([{ from: 2, to: 3, font: { bold: true } }]);
  });

  it("with the box's font, drops a style that is the same as the box's own", () => {
    const raw = [
      { from: 0, to: 2, font: { bold: false, size: 30 } },
      { from: 2, to: 3, font: { size: 24, color: "#E02424" } },
    ];
    expect(normalizeRuns(raw, "abcd", base)).toEqual([{ from: 0, to: 2, font: { size: 30 } }]);
  });
});

describe("styleRange", () => {
  it("styles the characters from..to over what is already there", () => {
    const before = [{ from: 0, to: 4, font: { bold: true } }];
    expect(styleRange(before, 2, 6, { color: "#00ff00" }, "abcdefgh", base)).toEqual([
      { from: 0, to: 2, font: { bold: true } },
      { from: 2, to: 4, font: { bold: true, color: "#00ff00" } },
      { from: 4, to: 6, font: { color: "#00ff00" } },
    ]);
  });

  it("turning a property back to the box's value removes it (and the run once it is plain)", () => {
    const before = [{ from: 0, to: 4, font: { bold: true } }];
    expect(styleRange(before, 1, 3, { bold: false }, "abcdef", base)).toEqual([
      { from: 0, to: 1, font: { bold: true } },
      { from: 3, to: 4, font: { bold: true } },
    ]);
    expect(styleRange(before, 0, 4, { bold: false }, "abcdef", base)).toEqual([]);
  });

  it("keeps a property that differs from the box's as an explicit override (not bold in a bold box)", () => {
    const boldBox = { ...base, bold: true };
    expect(styleRange([], 1, 3, { bold: false }, "abcd", boldBox)).toEqual([{ from: 1, to: 3, font: { bold: false } }]);
  });
});

describe("resetRunKeys", () => {
  it("removes a property from every run, and a run with nothing left", () => {
    const before = [
      { from: 0, to: 2, font: { bold: true } },
      { from: 3, to: 5, font: { bold: true, size: 40 } },
      { from: 6, to: 8, font: { color: "#00ff00" } },
    ];
    expect(resetRunKeys(before, ["bold"])).toEqual([
      { from: 3, to: 5, font: { size: 40 } },
      { from: 6, to: 8, font: { color: "#00ff00" } },
    ]);
    expect(resetRunKeys(before, ["bold", "size", "color"])).toEqual([]);
  });
});

describe("selectionFont", () => {
  const runs = [
    { from: 0, to: 3, font: { bold: true, size: 40 } },
    { from: 6, to: 8, font: { color: "#00ff00" } },
  ];
  it("is the box's own value where nothing is overridden", () => {
    expect(selectionFont(runs, base, "abcdefgh", 4, 6)).toEqual({ size: 24, bold: false, italic: false, underline: false, color: "#e02424" });
  });
  it("is the characters' value where they all agree", () => {
    expect(selectionFont(runs, base, "abcdefgh", 0, 3)).toMatchObject({ size: 40, bold: true, italic: false, color: "#e02424" });
  });
  it("is mixed for a property whose value differs inside the selection, and only that property", () => {
    expect(selectionFont(runs, base, "abcdefgh", 2, 7)).toEqual({ size: "mixed", bold: "mixed", italic: false, underline: false, color: "mixed" });
    expect(selectionFont(runs, base, "abcdefgh", 4, 8)).toMatchObject({ size: 24, bold: false, color: "mixed" });
  });
  it("ignores the newline characters", () => {
    // "ab\ncd": the bold run covers ab and cd; the selection takes in the newline between them
    const bold = [{ from: 0, to: 2, font: { bold: true } }, { from: 3, to: 5, font: { bold: true } }];
    expect(selectionFont(bold, base, "ab\ncd", 0, 5).bold).toBe(true);
  });
});
