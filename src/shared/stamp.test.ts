import { describe, expect, it } from "vitest";
import { formatStamp } from "./stamp";

describe("formatStamp", () => {
  it("formats local time as the Library file name YYYY-MM-DD HHmmss", () => {
    expect(formatStamp(new Date(2026, 10, 5, 9, 3, 7))).toBe("2026-11-05 090307");
  });
});
