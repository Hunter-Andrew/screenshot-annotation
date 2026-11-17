import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../platform/bridge";
import { formatWhen, groupByDate, type LibraryImage, neighbourAfterRemoval, sameLibrary, toLibraryImages } from "./libraryModel";

const item = (path: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
  path,
  modifiedMs: 1,
  createdMs: null,
  bytes: 10,
  width: 4,
  height: 3,
  ...over,
});

const image = (at: Date, path = `${at.getTime()}.png`): LibraryImage => ({ path, capturedAt: at, width: 1, height: 1, modifiedMs: 1, bytes: 1 });

describe("toLibraryImages", () => {
  it("puts the newest capture first, by the time in the file name", () => {
    const list = toLibraryImages([
      item("L\\2026-10\\2026-10-31 235959.png"),
      item("L\\2026-11\\2026-11-15 134501.png"),
      item("L\\2026-11\\2026-11-02 090000.png"),
    ]);
    expect(list.map((i) => i.path)).toEqual([
      "L\\2026-11\\2026-11-15 134501.png",
      "L\\2026-11\\2026-11-02 090000.png",
      "L\\2026-10\\2026-10-31 235959.png",
    ]);
  });

  it("does not move an image to the front when it is edited (its write time changes, its capture time does not)", () => {
    const list = toLibraryImages([
      item("a\\2026-11-01 100000.png", { modifiedMs: 9_999_999 }),
      item("a\\2026-11-02 100000.png", { modifiedMs: 1 }),
    ]);
    expect(list[0]!.path).toBe("a\\2026-11-02 100000.png");
  });

  it("files a PNG dropped in with any other name by when it was created, else last written", () => {
    const created = new Date(2026, 10, 14, 8, 0, 0).getTime();
    const list = toLibraryImages([
      item("L\\holiday.png", { createdMs: created, modifiedMs: 5 }),
      item("L\\other.png", { createdMs: null, modifiedMs: created + 1000 }),
      item("L\\2026-11\\2026-11-13 100000.png"),
    ]);
    expect(list.map((i) => i.path)).toEqual(["L\\other.png", "L\\holiday.png", "L\\2026-11\\2026-11-13 100000.png"]);
    expect(list[1]!.capturedAt.getTime()).toBe(created);
  });

  it("keeps a -2 file (taken in the same second) after its original in write order, and is stable", () => {
    const list = toLibraryImages([
      item("L\\2026-11-15 134501.png", { modifiedMs: 100 }),
      item("L\\2026-11-15 134501-2.png", { modifiedMs: 200 }),
    ]);
    expect(list.map((i) => i.path)).toEqual(["L\\2026-11-15 134501-2.png", "L\\2026-11-15 134501.png"]);
    expect(toLibraryImages([...list.map((i) => item(i.path, { modifiedMs: i.modifiedMs })).reverse()]).map((i) => i.path)).toEqual(list.map((i) => i.path));
  });

  it("carries the pixel size and the file's version through", () => {
    const [one] = toLibraryImages([item("L\\2026-11-15 134501.png", { width: 1920, height: 1080, modifiedMs: 7, bytes: 99 })]);
    expect(one).toMatchObject({ width: 1920, height: 1080, modifiedMs: 7, bytes: 99 });
  });

  it("an empty folder is an empty list", () => {
    expect(toLibraryImages([])).toEqual([]);
  });
});

describe("sameLibrary", () => {
  it("notices an added, removed or edited file and nothing else", () => {
    const a = toLibraryImages([item("L\\2026-11-15 134501.png"), item("L\\2026-11-14 134501.png")]);
    expect(sameLibrary(a, toLibraryImages([item("L\\2026-11-15 134501.png"), item("L\\2026-11-14 134501.png")]))).toBe(true);
    expect(sameLibrary(a, a.slice(1))).toBe(false);
    expect(sameLibrary(a, toLibraryImages([item("L\\2026-11-15 134501.png", { modifiedMs: 2 }), item("L\\2026-11-14 134501.png")]))).toBe(false);
    expect(sameLibrary(a, toLibraryImages([item("L\\2026-11-15 134501.png", { bytes: 11 }), item("L\\2026-11-14 134501.png")]))).toBe(false);
  });
});

describe("groupByDate", () => {
  // Sunday 15 November 2026, mid-afternoon.
  const now = new Date(2026, 10, 15, 15, 0, 0);
  const headings = (images: LibraryImage[], at = now) => groupByDate(images, at).map((g) => g.heading);

  it("names Today, Yesterday, then weekday and date for the rest of the week, then months", () => {
    const list = [
      image(new Date(2026, 10, 15, 14, 0, 0)),
      image(new Date(2026, 10, 15, 9, 0, 0)),
      image(new Date(2026, 10, 14, 23, 59, 59)),
      image(new Date(2026, 10, 13, 12, 0, 0)), // Friday
      image(new Date(2026, 10, 9, 12, 0, 0)), // Monday, 6 days ago
      image(new Date(2026, 10, 8, 12, 0, 0)), // 7 days ago: a month group
      image(new Date(2026, 10, 1, 12, 0, 0)),
      image(new Date(2026, 9, 31, 12, 0, 0)),
      image(new Date(2025, 11, 31, 12, 0, 0)),
    ];
    expect(headings(list)).toEqual([
      "Today",
      "Yesterday",
      "Friday 13 November",
      "Monday 9 November",
      "November 2026",
      "October 2026",
      "December 2025",
    ]);
    const groups = groupByDate(list, now);
    expect(groups.map((g) => g.images.length)).toEqual([2, 1, 1, 1, 2, 1, 1]);
  });

  it("changes at midnight, not 24 hours after the capture", () => {
    const late = image(new Date(2026, 10, 14, 23, 59, 59));
    expect(headings([late], new Date(2026, 10, 14, 23, 59, 59))).toEqual(["Today"]);
    expect(headings([late], new Date(2026, 10, 15, 0, 0, 0))).toEqual(["Yesterday"]);
    expect(headings([late], new Date(2026, 10, 15, 23, 59, 59))).toEqual(["Yesterday"]);
    expect(headings([late], new Date(2026, 10, 16, 0, 0, 0))).toEqual(["Saturday 14 November"]);
  });

  it("handles month and year boundaries", () => {
    const now2 = new Date(2026, 0, 1, 10, 0, 0); // Thursday 1 January 2026
    const list = [image(new Date(2025, 11, 31, 22, 0, 0)), image(new Date(2025, 11, 30, 22, 0, 0)), image(new Date(2025, 11, 25, 22, 0, 0))];
    expect(headings(list, now2)).toEqual(["Yesterday", "Tuesday 30 December", "December 2025"]);
    const march = new Date(2026, 2, 1, 10, 0, 0);
    expect(headings([image(new Date(2026, 1, 28, 10, 0, 0)), image(new Date(2026, 1, 27, 10, 0, 0))], march)).toEqual(["Yesterday", "Friday 27 February"]);
  });

  it("is not thrown by a daylight-saving change", () => {
    // 2026-03-29 02:00 is when clocks go forward in much of Europe; the calendar days still count right.
    const sunday = new Date(2026, 2, 29, 12, 0, 0);
    expect(headings([image(new Date(2026, 2, 28, 12, 0, 0))], sunday)).toEqual(["Yesterday"]);
    expect(headings([image(new Date(2026, 2, 22, 12, 0, 0))], sunday)).toEqual(["March 2026"]);
  });

  it("treats a capture time after now (a clock that moved back) as Today", () => {
    expect(headings([image(new Date(2026, 10, 16, 9, 0, 0))])).toEqual(["Today"]);
  });

  it("gives every group a distinct stable key and an empty list no groups", () => {
    const keys = groupByDate([image(new Date(2026, 10, 15, 1)), image(new Date(2026, 10, 13, 1)), image(new Date(2026, 9, 13, 1))], now).map((g) => g.key);
    expect(keys).toEqual(["today", "day:2026-11-13", "month:2026-10"]);
    expect(groupByDate([], now)).toEqual([]);
  });
});

describe("formatWhen", () => {
  it("shows the date and the time to the second", () => {
    expect(formatWhen(new Date(2026, 10, 5, 9, 4, 3))).toBe("5 Nov 2026 09:04:03");
  });
});

describe("neighbourAfterRemoval", () => {
  const list = ["e", "d", "c", "b", "a"].map((p) => image(new Date(2026, 10, 15, 10), p)); // newest first
  it("prefers the next older image", () => {
    expect(neighbourAfterRemoval(list, new Set(["c"]), "c")).toBe("b");
  });
  it("skips others being removed at the same time", () => {
    expect(neighbourAfterRemoval(list, new Set(["c", "b"]), "c")).toBe("a");
  });
  it("falls back to the next newer image when nothing older is left", () => {
    expect(neighbourAfterRemoval(list, new Set(["a"]), "a")).toBe("b");
    expect(neighbourAfterRemoval(list, new Set(["a", "b", "c"]), "a")).toBe("d");
  });
  it("is null when everything goes", () => {
    expect(neighbourAfterRemoval(list, new Set(["a", "b", "c", "d", "e"]), "c")).toBeNull();
    expect(neighbourAfterRemoval([], new Set(), "x")).toBeNull();
  });
});
