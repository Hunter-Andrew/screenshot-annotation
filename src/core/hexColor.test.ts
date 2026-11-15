import { describe, expect, it } from "vitest";
import { HEX } from "./propertyGroups";
import { parseHexColor } from "./hexColor";

describe("parseHexColor", () => {
  it.each([
    ["#e02424", "#e02424"],
    ["e02424", "#e02424"],
    ["#E02424", "#e02424"],
    ["E02424", "#e02424"],
    ["  #e02424  ", "#e02424"],
    ["\t#e02424\n", "#e02424"],
  ])("accepts the long form %j", (input, expected) => {
    expect(parseHexColor(input)).toBe(expected);
  });

  it.each([
    ["#f80", "#ff8800"],
    ["f80", "#ff8800"],
    ["#ABC", "#aabbcc"],
    [" abc ", "#aabbcc"],
  ])("expands the short form %j", (input, expected) => {
    expect(parseHexColor(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "#",
    "#12",
    "#1234",
    "#12345",
    "#1234567",
    "#e0242400", // alpha hex is not supported: opacity lives in Fill opacity
    "#ff80", // 4-digit alpha short form
    "#gggggg",
    "#e02 424",
    "##e02424",
    "red",
    "rgb(1,2,3)",
    "#e02424;",
  ])("rejects %j", (input) => {
    expect(parseHexColor(input)).toBeNull();
  });

  it("returns exactly the format the model stores (what the stored-color sanitizer accepts)", () => {
    for (const input of ["#E02", "FACC15", " #2563EB "]) expect(parseHexColor(input)).toMatch(HEX);
  });
});
