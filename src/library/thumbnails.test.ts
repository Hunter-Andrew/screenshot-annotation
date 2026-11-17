import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryImage } from "./libraryModel";
import { createThumbnailLoader, thumbnailKey } from "./thumbnails";

const image = (path: string, modifiedMs = 1): LibraryImage => ({
  path,
  capturedAt: new Date(2026, 10, 15),
  width: 4,
  height: 3,
  modifiedMs,
  bytes: 10,
});

/** A bridge whose thumbnails resolve only when the test says so. */
function slowBridge() {
  const pending: { path: string; resolve: () => void; reject: () => void }[] = [];
  const requested: string[] = [];
  return {
    pending,
    requested,
    bridge: {
      getThumbnail: (path: string) =>
        new Promise<Uint8Array>((resolve, reject) => {
          requested.push(path);
          pending.push({ path, resolve: () => resolve(new Uint8Array([1, 2, 3])), reject: () => reject(new Error("no")) });
        }),
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

let revoked: string[];
beforeEach(() => {
  revoked = [];
  let n = 0;
  URL.createObjectURL = () => `blob:thumb-${++n}`;
  URL.revokeObjectURL = (url) => void revoked.push(url);
});
afterEach(() => vi.restoreAllMocks());

describe("thumbnail loader", () => {
  it("asks for only a few at a time and starts the next as each finishes", async () => {
    const s = slowBridge();
    const loader = createThumbnailLoader(s.bridge, { concurrency: 2 });
    const got: string[] = [];
    for (const p of ["a", "b", "c", "d"]) loader.request(image(p), (url) => got.push(`${p}:${url}`), () => {});
    expect(s.requested).toEqual(["a", "b"]);
    s.pending[0]!.resolve();
    await settle();
    expect(s.requested).toEqual(["a", "b", "c"]);
    expect(got).toEqual(["a:blob:thumb-1"]);
  });

  it("remembers a thumbnail: asking again, even from another place, does not go back to the platform", async () => {
    const s = slowBridge();
    const loader = createThumbnailLoader(s.bridge);
    const first: string[] = [];
    loader.request(image("a"), (u) => first.push(u), () => {});
    s.pending[0]!.resolve();
    await settle();
    expect(loader.peek(image("a"))).toBe(first[0]);
    const again: string[] = [];
    loader.request(image("a"), (u) => again.push(u), () => {});
    expect(again).toEqual(first);
    expect(s.requested).toEqual(["a"]);
  });

  it("two requests for the same thumbnail at once share one fetch", async () => {
    const s = slowBridge();
    const loader = createThumbnailLoader(s.bridge);
    const urls: string[] = [];
    loader.request(image("a"), (u) => urls.push(u), () => {});
    loader.request(image("a"), (u) => urls.push(u), () => {});
    expect(s.requested).toEqual(["a"]);
    s.pending[0]!.resolve();
    await settle();
    expect(urls).toHaveLength(2);
  });

  it("makes a new thumbnail when the file changed", async () => {
    const s = slowBridge();
    const loader = createThumbnailLoader(s.bridge);
    loader.request(image("a", 1), () => {}, () => {});
    s.pending[0]!.resolve();
    await settle();
    expect(loader.peek(image("a", 2))).toBeNull();
    expect(thumbnailKey(image("a", 1))).not.toBe(thumbnailKey(image("a", 2)));
  });

  it("skips a thumbnail whose requester scrolled away before it started", async () => {
    const s = slowBridge();
    const loader = createThumbnailLoader(s.bridge, { concurrency: 1 });
    loader.request(image("a"), () => {}, () => {});
    const cancel = loader.request(image("b"), () => {}, () => {});
    loader.request(image("c"), () => {}, () => {});
    cancel();
    s.pending[0]!.resolve();
    await settle();
    expect(s.requested).toEqual(["a", "c"]);
  });

  it("reports a thumbnail the platform could not make, and carries on with the rest", async () => {
    const s = slowBridge();
    const loader = createThumbnailLoader(s.bridge, { concurrency: 1 });
    const errors: string[] = [];
    loader.request(image("a"), () => {}, () => errors.push("a"));
    loader.request(image("b"), () => {}, () => errors.push("b"));
    s.pending[0]!.reject();
    await settle();
    expect(errors).toEqual(["a"]);
    expect(s.requested).toEqual(["a", "b"]);
  });

  it("forgets the least recently used and frees its URL", async () => {
    const s = slowBridge();
    const loader = createThumbnailLoader(s.bridge, { cacheSize: 2 });
    for (const p of ["a", "b", "c"]) {
      loader.request(image(p), () => {}, () => {});
      s.pending.at(-1)!.resolve();
      await settle();
    }
    expect(loader.peek(image("a"))).toBeNull();
    expect(loader.peek(image("c"))).not.toBeNull();
    expect(revoked).toEqual(["blob:thumb-1"]);
  });

  it("frees everything when disposed and ignores late answers", async () => {
    const s = slowBridge();
    const loader = createThumbnailLoader(s.bridge, { concurrency: 1 });
    const got: string[] = [];
    loader.request(image("a"), (u) => got.push(u), () => {});
    loader.dispose();
    s.pending[0]!.resolve();
    await settle();
    expect(got).toEqual([]);
  });
});
