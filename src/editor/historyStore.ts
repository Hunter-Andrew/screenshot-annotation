// Reads and writes the undo history of Library images through the platform bridge (ticket 13).
// The rules (cap, hash discard, expiry, corrupt files) live in src/core/history*.ts; this only wires
// them to the bridge's four file operations. Nothing here throws on a bad or unreadable history: it
// is a convenience, and an image must always open.
import { contentHash } from "../core/hash";
import { HISTORY_CAP, type HistoryState, historyImageIds } from "../core/history";
import { expiryCutoff, restoreHistory, serializeHistory } from "../core/historyFile";
import type { PlatformBridge } from "../platform/bridge";

/** The history file's name: the hash of the image's Library path (case-insensitive, like Windows). */
export function historyKey(path: string): Promise<string> {
  return contentHash(new TextEncoder().encode(path.toLowerCase()));
}

/** Pasted images (ticket 38) as the history store sees them at a save. */
export interface SavedImages {
  /** Every pasted image the session holds, by `imageId`. */
  images: Readonly<Record<string, Uint8Array>>;
  /** The ids the Library PNG just written already carries (they need no second copy here). */
  embedded: readonly string[];
}

export interface HistoryStore {
  /** The history to start an image with, given the PNG bytes just read from `path`. Never rejects. */
  open(path: string, png: Uint8Array): Promise<HistoryState>;
  /** Like `open`, and also the bytes of deleted pasted images the history can restore (merge them into the image's `images`). */
  openWithImages(path: string, png: Uint8Array): Promise<{ history: HistoryState; images: Record<string, Uint8Array> }>;
  /** Store `history` for the PNG bytes just written to `path` (no file for an empty history). Never rejects. */
  save(path: string, png: Uint8Array, history: HistoryState, pasted?: SavedImages): Promise<void>;
  /** The image was discarded: its history goes with it. Never rejects. */
  remove(path: string): Promise<void>;
  /** Delete the history of every image not opened or edited for 60 days. Resolves to how many went. */
  purgeExpired(): Promise<number>;
}

export function createHistoryStore(options: {
  bridge: Pick<PlatformBridge, "readHistory" | "writeHistory" | "deleteHistory" | "purgeHistoryBefore">;
  /** Milliseconds since the epoch; injectable for tests. */
  now?: () => number;
}): HistoryStore {
  const { bridge } = options;
  const now = options.now ?? Date.now;
  // One queue: a save, an open's touch and a remove never overtake each other.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };
  const quietly = async (task: () => Promise<unknown>) => {
    try {
      await task();
    } catch {
      // History is best-effort.
    }
  };

  const openWithImages: HistoryStore["openWithImages"] = (path, png) =>
    enqueue(async () => {
      const empty = { history: { undo: [], redo: [] } as HistoryState, images: {} };
      try {
        const [key, hash] = await Promise.all([historyKey(path), contentHash(png)]);
        const restored = restoreHistory(await bridge.readHistory(key), hash, now());
        if (restored.reason === "restored") {
          // Opening counts as use: stamp it so the 60 days start again.
          await bridge.writeHistory(
            key,
            serializeHistory({ hash, touchedAt: now(), history: restored.history, images: restored.images }),
          );
        } else if (restored.reason !== "none") {
          await quietly(() => bridge.deleteHistory(key));
        }
        return { history: restored.history, images: restored.images };
      } catch {
        return empty;
      }
    });

  return {
    openWithImages,
    open: async (path, png) => (await openWithImages(path, png)).history,
    save: (path, png, history, pasted) =>
      enqueue(() =>
        quietly(async () => {
          const key = await historyKey(path);
          if (history.undo.length === 0 && history.redo.length === 0) return bridge.deleteHistory(key);
          const capped = { undo: history.undo.slice(-HISTORY_CAP), redo: history.redo.slice(-HISTORY_CAP) };
          // The bytes of images the steps can put back and the Library PNG does not hold.
          const images: Record<string, Uint8Array> = {};
          for (const id of historyImageIds(capped)) {
            const bytes = pasted?.images[id];
            if (bytes && !pasted.embedded.includes(id)) images[id] = bytes;
          }
          await bridge.writeHistory(
            key,
            serializeHistory({ hash: await contentHash(png), touchedAt: now(), history: capped, images }),
          );
        }),
      ),
    remove: (path) => enqueue(() => quietly(async () => bridge.deleteHistory(await historyKey(path)))),
    purgeExpired: () => enqueue(async () => {
      try {
        return await bridge.purgeHistoryBefore(expiryCutoff(now()));
      } catch {
        return 0;
      }
    }),
  };
}
