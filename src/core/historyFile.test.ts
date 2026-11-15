// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contentHash } from "./hash";
import { HISTORY_CAP, type HistoryState, type Step } from "./history";
import {
  DAY_MS,
  EXPIRY_DAYS,
  HISTORY_FORMAT_VERSION,
  expiryCutoff,
  isExpired,
  parseHistory,
  restoreHistory,
  serializeHistory,
} from "./historyFile";

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
const step = (n: number): Step => ({
  undo: { kind: "delete", id: `a${n}` },
  redo: {
    kind: "add",
    annotation: {
      id: `a${n}`,
      type: "arrow",
      x1: 0,
      y1: 0,
      x2: n,
      y2: 1,
      stroke: { color: "#e02424", width: 4 },
      arrowheads: { ends: "end" },
    },
  },
  at: NOW - n,
});
const history = (n: number): HistoryState => ({ undo: Array.from({ length: n }, (_, i) => step(i)), redo: [step(99)] });
const file = (overrides: Partial<{ hash: string; touchedAt: number; history: HistoryState }> = {}) =>
  serializeHistory({ hash: "h1", touchedAt: NOW, history: history(3), ...overrides });

describe("contentHash", () => {
  it("is the SHA-256 of the bytes, in hex", async () => {
    expect(await contentHash(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("expiry (60 days without opening or editing)", () => {
  it("is 60 days: just inside keeps, just past expires", () => {
    expect(EXPIRY_DAYS).toBe(60);
    expect(isExpired(NOW - 60 * DAY_MS, NOW)).toBe(false);
    expect(isExpired(NOW - 60 * DAY_MS - 1, NOW)).toBe(true);
    expect(isExpired(NOW, NOW)).toBe(false);
  });

  it("the purge cutoff is the instant a history just expires at", () => {
    expect(expiryCutoff(NOW)).toBe(NOW - 60 * DAY_MS);
  });

  it("a history from the future (clock moved back) is not expired", () => {
    expect(isExpired(NOW + 5 * DAY_MS, NOW)).toBe(false);
  });
});

describe("the history file", () => {
  it("round-trips, and carries a format version", () => {
    const text = file();
    expect(JSON.parse(text).version).toBe(HISTORY_FORMAT_VERSION);
    expect(parseHistory(text)).toEqual({ hash: "h1", touchedAt: NOW, history: history(3) });
  });

  it.each([
    ["not JSON", "{oops"],
    ["empty", ""],
    ["not an object", "[1,2]"],
    ["a newer format version", JSON.stringify({ ...JSON.parse(file()), version: HISTORY_FORMAT_VERSION + 1 })],
    ["no hash", JSON.stringify({ ...JSON.parse(file()), hash: undefined })],
    ["a step with an unknown edit kind", JSON.stringify({ ...JSON.parse(file()), history: { undo: [{ undo: { kind: "boom" }, redo: { kind: "delete", id: "a" }, at: 1 }], redo: [] } })],
    ["undo that is not a list", JSON.stringify({ ...JSON.parse(file()), history: { undo: "x", redo: [] } })],
    ["an add without an Annotation", JSON.stringify({ ...JSON.parse(file()), history: { undo: [{ undo: { kind: "add" }, redo: { kind: "delete", id: "a" }, at: 1 }], redo: [] } })],
  ])("treats %s as corrupt (null), never throws", (_name, text) => {
    expect(parseHistory(text)).toBeNull();
  });
});

describe("restoreHistory: what to do with a stored history when an image is opened", () => {
  it("restores it when the PNG hash matches and it is fresh", () => {
    const result = restoreHistory(file(), "h1", NOW);
    expect(result.reason).toBe("restored");
    expect(result.history).toEqual(history(3));
  });

  it("starts empty when there is none", () => {
    expect(restoreHistory(null, "h1", NOW)).toEqual({ reason: "none", history: { undo: [], redo: [] } });
  });

  it("discards it when the PNG changed outside the app (hash mismatch)", () => {
    expect(restoreHistory(file(), "h2", NOW)).toEqual({ reason: "changed", history: { undo: [], redo: [] } });
  });

  it("discards it after 60 days without opening or editing", () => {
    const old = file({ touchedAt: NOW - 61 * DAY_MS });
    expect(restoreHistory(old, "h1", NOW)).toEqual({ reason: "expired", history: { undo: [], redo: [] } });
    expect(restoreHistory(file({ touchedAt: NOW - 59 * DAY_MS }), "h1", NOW).reason).toBe("restored");
  });

  it("discards a corrupt file instead of failing", () => {
    expect(restoreHistory("{oops", "h1", NOW)).toEqual({ reason: "corrupt", history: { undo: [], redo: [] } });
  });

  it("enforces the 200-step cap on what it loads, keeping the newest", () => {
    const result = restoreHistory(file({ history: history(HISTORY_CAP + 25) }), "h1", NOW);
    expect(result.history.undo).toHaveLength(HISTORY_CAP);
    expect(result.history.undo.at(-1)).toEqual(step(HISTORY_CAP + 24));
  });
});
