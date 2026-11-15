import { describe, expect, it } from "vitest";
import { capturedAtFromPath, formatStamp } from "./stamp";

describe("formatStamp", () => {
  it("formats local time as the Library file name YYYY-MM-DD HHmmss", () => {
    expect(formatStamp(new Date(2026, 10, 5, 9, 3, 7))).toBe("2026-11-05 090307");
  });
});

describe("capturedAtFromPath", () => {
  it("reads the capture time back out of a Library path, with or without a collision suffix", () => {
    const expected = new Date(2026, 10, 5, 9, 3, 7).getTime();

    expect(capturedAtFromPath("2026-11\\2026-11-05 090307.png")?.getTime()).toBe(expected);
    expect(capturedAtFromPath("C:\\Users\\a\\Pictures\\Screenshot Annotation\\2026-11\\2026-11-05 090307-2.png")?.getTime()).toBe(expected);
    expect(capturedAtFromPath("/home/a/2026-11-05 090307.png")?.getTime()).toBe(expected);
  });

  it("returns null for a file that is not named by capture time", () => {
    expect(capturedAtFromPath("2026-11\\holiday.png")).toBeNull();
    expect(capturedAtFromPath("2026-13-45 999999.png")).toBeNull();
  });
});
