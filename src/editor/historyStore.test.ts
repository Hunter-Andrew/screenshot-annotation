// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY_MS, serializeHistory } from "../core/historyFile";
import { HISTORY_CAP, type HistoryState } from "../core/history";
import { createFakeBridge } from "../platform/fakeBridge";
import { createHistoryStore, historyKey } from "./historyStore";

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
const PATH = "C:\\Pictures\\Sigil (Screenshot Annotation)\\2026-11\\2026-11-15 120000.png";
const png = (n: number) => new Uint8Array([137, 80, 78, 71, n]);
const history = (n: number): HistoryState => ({
  undo: Array.from({ length: n }, (_, i) => ({
    undo: { kind: "delete" as const, id: `a${i}` },
    redo: { kind: "delete" as const, id: `a${i}` },
    at: NOW,
  })),
  redo: [],
});

function setup(now = NOW) {
  const bridge = createFakeBridge();
  const clock = { now };
  return { bridge, clock, store: createHistoryStore({ bridge, now: () => clock.now }) };
}

describe("the history store and pasted images (ticket 38)", () => {
  const annotation = (imageId: string) => ({
    id: `i-${imageId}`,
    type: "image" as const,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    imageId,
    border: { enabled: false, color: "#e02424", width: 4 },
    opacity: { value: 1 },
  });
  const deleting = (imageId: string): HistoryState => ({
    undo: [{ undo: { kind: "add", annotation: annotation(imageId) }, redo: { kind: "delete", id: `i-${imageId}` }, at: NOW }],
    redo: [],
  });

  it("keeps the bytes of an image its steps can restore, and hands them back on open", async () => {
    const { bridge, store } = setup();
    await store.save(PATH, png(1), deleting("gone"), { images: { gone: png(7) }, embedded: [] });

    const restarted = createHistoryStore({ bridge, now: () => NOW });
    const opened = await restarted.openWithImages(PATH, png(1));
    expect(opened.history.undo).toHaveLength(1);
    expect(opened.images.gone).toEqual(png(7));
  });

  it("does not copy an image the Library PNG itself already holds, nor one no step refers to", async () => {
    const { bridge, store } = setup();
    await store.save(PATH, png(1), deleting("inFile"), { images: { inFile: png(7), unrelated: png(8) }, embedded: ["inFile"] });

    const opened = await createHistoryStore({ bridge, now: () => NOW }).openWithImages(PATH, png(1));
    expect(opened.images).toEqual({});
  });

  it("still holds the bytes after being opened (opening only touches the file's time)", async () => {
    const { bridge, store } = setup();
    await store.save(PATH, png(1), deleting("gone"), { images: { gone: png(7) }, embedded: [] });
    await store.openWithImages(PATH, png(1));

    const again = await createHistoryStore({ bridge, now: () => NOW }).openWithImages(PATH, png(1));
    expect(again.images.gone).toEqual(png(7));
  });
});

describe("the history store", () => {
  it("brings back what was saved for the same PNG, after a restart (a new store)", async () => {
    const { bridge, store } = setup();
    await store.save(PATH, png(1), history(3));

    const restarted = createHistoryStore({ bridge, now: () => NOW + DAY_MS });
    expect((await restarted.open(PATH, png(1))).undo).toHaveLength(3);
  });

  it("is keyed by path: another image has its own history", async () => {
    const { store } = setup();
    await store.save(PATH, png(1), history(3));
    expect((await store.open(PATH.replace("120000", "130000"), png(1))).undo).toEqual([]);
  });

  it("discards the history, and deletes its file, when the PNG changed outside the app", async () => {
    const { bridge, store } = setup();
    await store.save(PATH, png(1), history(3));

    expect((await store.open(PATH, png(2))).undo).toEqual([]);
    expect(bridge.historyFiles.size).toBe(0);
  });

  it("discards a history untouched for over 60 days, and keeps one touched 59 days ago", async () => {
    const { bridge, clock, store } = setup();
    await store.save(PATH, png(1), history(3));

    clock.now = NOW + 59 * DAY_MS;
    expect((await store.open(PATH, png(1))).undo).toHaveLength(3);
    // Opening touched it: 59 more days is still inside the window.
    clock.now += 59 * DAY_MS;
    expect((await store.open(PATH, png(1))).undo).toHaveLength(3);
    // But 61 days without opening is too long.
    clock.now += 61 * DAY_MS;
    expect((await store.open(PATH, png(1))).undo).toEqual([]);
    expect(bridge.historyFiles.size).toBe(0);
  });

  it("discards a corrupt file instead of failing, and deletes it", async () => {
    const { bridge, store } = setup();
    await bridge.writeHistory(await historyKey(PATH), "{not json");

    expect((await store.open(PATH, png(1))).undo).toEqual([]);
    expect(bridge.historyFiles.size).toBe(0);
  });

  it("opens with no history when the platform cannot read it", async () => {
    const { bridge, store } = setup();
    bridge.readHistory = async () => {
      throw new Error("disk on fire");
    };
    expect((await store.open(PATH, png(1))).undo).toEqual([]);
  });

  it("saves at most 200 steps", async () => {
    const { store } = setup();
    await store.save(PATH, png(1), history(HISTORY_CAP + 30));
    expect((await store.open(PATH, png(1))).undo).toHaveLength(HISTORY_CAP);
  });

  it("an empty history is no file at all", async () => {
    const { bridge, store } = setup();
    await store.save(PATH, png(1), history(2));
    await store.save(PATH, png(1), history(0));
    expect(bridge.historyFiles.size).toBe(0);
  });

  it("remove deletes the file (the image was discarded)", async () => {
    const { bridge, store } = setup();
    await store.save(PATH, png(1), history(2));
    await store.remove(PATH);
    expect(bridge.historyFiles.size).toBe(0);
  });

  it("purgeExpired asks the platform to drop files older than 60 days", async () => {
    const { bridge, store } = setup();
    const key = await historyKey(PATH);
    const other = await historyKey("other");
    bridge.historyFiles.set(key, { text: serializeHistory({ hash: "x", touchedAt: 0, history: history(1) }), modifiedAt: NOW - 61 * DAY_MS });
    bridge.historyFiles.set(other, { text: "x", modifiedAt: NOW - 59 * DAY_MS });

    expect(await store.purgeExpired()).toBe(1);
    expect([...bridge.historyFiles.keys()]).toEqual([other]);
  });
});
