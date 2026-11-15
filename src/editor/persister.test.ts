// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFromCapture, decodeLibraryPng, type FinishedRenderer } from "../core/annotatedImage";
import type { ArrowAnnotation } from "../core/annotation";
import { createEditSession } from "../core/editSession";
import { encodeRgbaPng } from "../core/png";
import type { PlatformBridge } from "../platform/bridge";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { createPersister, type PersisterEvent } from "./persister";

const CAPTURED_AT = new Date(2026, 10, 15, 13, 45, 1);
const arrow = (id: string, x2 = 50): ArrowAnnotation => ({
  id,
  type: "arrow",
  x1: 0,
  y1: 0,
  x2,
  y2: 10,
  stroke: { color: "#e02424", width: 4 },
  arrowheads: { ends: "end" },
});
// The renderer is the browser's job; a stand-in that hands back the Capture keeps these tests about saving.
const render: FinishedRenderer = async (image) => image.capture;

const newSession = () => createEditSession(createFromCapture(encodeRgbaPng(1, 1, new Uint8Array([1, 2, 3, 255]))));

/** A promise a test settles by hand, to hold a bridge call in flight. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(options: { path?: string; readOnly?: boolean; bridge?: Partial<PlatformBridge> } = {}) {
  const fake: FakeBridge = createFakeBridge();
  const bridge: PlatformBridge = Object.assign(Object.create(fake), options.bridge ?? {}) as PlatformBridge;
  const session = newSession();
  const events: PersisterEvent[] = [];
  const persister = createPersister({
    bridge,
    session,
    capturedAt: CAPTURED_AT,
    render,
    path: options.path,
    readOnly: options.readOnly,
    onEvent: (e) => events.push(e),
  });
  const edit = (annotation = arrow("a1")) => {
    session.apply({ kind: "add", annotation });
    persister.markDirty();
  };
  return { fake, session, persister, events, edit };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("first save of a new Capture", () => {
  it("writes the Library PNG at once and reports its path", async () => {
    const { fake, persister, events } = setup();

    const path = await persister.start();

    expect(fake.libraryFiles.map((f) => f.path)).toEqual([path]);
    expect(path).toMatch(/2026-11\\2026-11-15 134501\.png$/);
    expect(events).toEqual([{ kind: "saved", path, first: true }]);
    expect(decodeLibraryPng(fake.libraryFiles[0]!.bytes).model.annotations).toEqual([]);
  });

  it("rejects when the first save fails, and the next auto-save tries it again as a first save", async () => {
    let calls = 0;
    const { fake, persister, edit } = setup({
      bridge: {
        saveToLibrary: async (png, at) => {
          if (calls++ === 0) throw new Error("disk full");
          return fake.saveToLibrary(png, at);
        },
      },
    });

    await expect(persister.start()).rejects.toThrow("disk full");
    edit();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fake.libraryFiles).toHaveLength(1);
    expect(decodeLibraryPng(fake.libraryFiles[0]!.bytes).model.annotations).toHaveLength(1);
  });
});

describe("auto-save", () => {
  it("re-encodes the Library PNG about 1 s after an edit, not before", async () => {
    const { fake, persister, edit } = setup();
    await persister.start();

    edit();
    await vi.advanceTimersByTimeAsync(999);
    expect(fake.libraryUpdates).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(fake.libraryUpdates).toHaveLength(1);
    const saved = decodeLibraryPng(fake.libraryUpdates[0]!.bytes);
    expect(saved.model.annotations).toEqual([arrow("a1")]);
    expect(fake.libraryUpdates[0]!.path).toBe(persister.path);
  });

  it("is debounced: a burst of edits makes one save, 1 s after the last one", async () => {
    const { fake, persister, edit } = setup();
    await persister.start();

    edit(arrow("a1"));
    await vi.advanceTimersByTimeAsync(600);
    edit(arrow("a2"));
    await vi.advanceTimersByTimeAsync(600);
    edit(arrow("a3"));
    await vi.advanceTimersByTimeAsync(999);
    expect(fake.libraryUpdates).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(fake.libraryUpdates).toHaveLength(1);
    expect(decodeLibraryPng(fake.libraryUpdates[0]!.bytes).model.annotations.map((a) => a.id)).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
  });

  it("writes nothing when nothing changed", async () => {
    const { fake, persister } = setup();
    await persister.start();

    await persister.flush();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fake.libraryUpdates).toHaveLength(0);
  });

  it("flush saves a pending edit now (used when the window hides or the image changes)", async () => {
    const { fake, persister, edit } = setup();
    await persister.start();
    edit();

    await persister.flush();

    expect(fake.libraryUpdates).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fake.libraryUpdates).toHaveLength(1);
  });

  it("keeps the edit pending when the save fails, says so, and saves it on the next flush", async () => {
    const { fake, persister, edit, events } = setup();
    await persister.start();
    fake.failNextLibraryUpdate("file is locked");
    edit();

    await vi.advanceTimersByTimeAsync(1000);
    expect(events.at(-1)).toEqual({ kind: "error", message: "file is locked", first: false });
    expect(fake.libraryUpdates).toHaveLength(0);

    await persister.flush();
    expect(fake.libraryUpdates).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ kind: "saved", first: false });
  });

  it("never writes a read-only image (saved by a newer version)", async () => {
    const { fake, persister, edit } = setup({ path: "2026-11\\old.png", readOnly: true });
    await persister.start();

    edit();
    await persister.flush();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fake.libraryUpdates).toHaveLength(0);
  });

  it("updates the file an image was opened from, without a first save", async () => {
    const seed = createFakeBridge();
    const path = await seed.saveToLibrary(new Uint8Array([1]), CAPTURED_AT);
    const { fake, persister, edit } = setup({
      path,
      bridge: { updateLibraryFile: async (p, png) => (seed.libraryFiles[0]!.bytes = png, void p) },
    });

    expect(await persister.start()).toBe(path);
    edit();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fake.libraryFiles).toHaveLength(0); // no new file
    expect(decodeLibraryPng(seed.libraryFiles[0]!.bytes).model.annotations).toHaveLength(1);
  });
});

describe("races", () => {
  it("an edit made while the first save is in flight goes into the same file, never a second one", async () => {
    const gate = deferred();
    const { fake, persister, edit } = setup({
      bridge: {
        saveToLibrary: async (png, at) => {
          await gate.promise;
          return fake.saveToLibrary(png, at);
        },
      },
    });

    const first = persister.start();
    await vi.advanceTimersByTimeAsync(0); // the first save is now in flight, waiting on the bridge
    edit();
    await vi.advanceTimersByTimeAsync(3000); // the auto-save is due, but the first save has not landed
    expect(fake.libraryFiles).toHaveLength(0);
    expect(fake.libraryUpdates).toHaveLength(0);
    gate.resolve();
    const path = await first;
    await vi.advanceTimersByTimeAsync(0);

    expect(fake.libraryFiles.map((f) => f.path)).toEqual([path]);
    expect(fake.libraryUpdates.map((u) => u.path)).toEqual([path]);
    expect(decodeLibraryPng(fake.libraryFiles[0]!.bytes).model.annotations).toHaveLength(1);
  });

  it("an edit made while an auto-save is writing is saved after it, in order, never interleaved", async () => {
    const gate = deferred();
    const log: string[] = [];
    let calls = 0;
    const { fake, persister, edit } = setup({
      bridge: {
        updateLibraryFile: async (path, png) => {
          const n = ++calls;
          log.push(`start ${n}`);
          if (n === 1) await gate.promise;
          await fake.updateLibraryFile(path, png);
          log.push(`end ${n}`);
        },
      },
    });
    await persister.start();

    edit(arrow("a1"));
    await vi.advanceTimersByTimeAsync(1000); // first auto-save starts and hangs
    edit(arrow("a2"));
    await vi.advanceTimersByTimeAsync(1000); // second is due while the first is still writing
    expect(log).toEqual(["start 1"]);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2"]);
    expect(decodeLibraryPng(fake.libraryFiles[0]!.bytes).model.annotations.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("Discard cancels a pending auto-save, and nothing writes (or recreates the file) afterwards", async () => {
    const { fake, persister, edit } = setup();
    const path = await persister.start();
    edit();

    await persister.discard();
    await vi.advanceTimersByTimeAsync(5000);
    edit(arrow("late"));
    await persister.flush();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fake.discardedPaths).toEqual([path]);
    expect(fake.libraryFiles).toEqual([]);
    expect(fake.libraryUpdates).toEqual([]);
  });

  it("Discard waits for the first save to land, then discards that very file", async () => {
    const gate = deferred();
    const { fake, persister } = setup({
      bridge: {
        saveToLibrary: async (png, at) => {
          await gate.promise;
          return fake.saveToLibrary(png, at);
        },
      },
    });
    const first = persister.start();
    await vi.advanceTimersByTimeAsync(0); // the first save is now in flight, waiting on the bridge

    let discarded = false;
    const discarding = persister.discard().then(() => (discarded = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(discarded).toBe(false);
    gate.resolve();
    await first;
    await discarding;

    expect(fake.libraryFiles).toEqual([]);
    expect(fake.discardedPaths).toHaveLength(1);
  });

  it("a Discard before the first save has begun means the image is never written at all", async () => {
    const { fake, persister } = setup();

    const first = persister.start();
    await persister.discard();

    expect(await first).toBeNull();
    expect(fake.libraryFiles).toEqual([]);
    expect(fake.discardedPaths).toEqual([]);
  });

  it("Discard waits for an auto-save that is writing, so the file is not touched after it is gone", async () => {
    const gate = deferred();
    const { fake, persister, edit } = setup({
      bridge: {
        updateLibraryFile: async (path, png) => {
          await gate.promise;
          await fake.updateLibraryFile(path, png);
        },
      },
    });
    await persister.start();
    edit();
    await vi.advanceTimersByTimeAsync(1000);

    const discarding = persister.discard();
    gate.resolve();
    await discarding;

    expect(fake.libraryFiles).toEqual([]);
    expect(fake.libraryUpdates).toHaveLength(1); // the write finished before the file was removed
  });

  it("a Discard that fails leaves the image saving as before", async () => {
    const { fake, persister, edit } = setup();
    await persister.start();
    fake.failNextDiscard("file is locked");

    await expect(persister.discard()).rejects.toThrow("file is locked");
    edit();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fake.libraryUpdates).toHaveLength(1);
    expect(fake.libraryFiles).toHaveLength(1);
  });
});
