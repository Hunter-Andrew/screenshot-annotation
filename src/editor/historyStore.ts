// Reads and writes the undo history of Library images through the platform bridge (ticket 13).
// The rules (cap, hash discard, expiry, corrupt files) live in src/core/history*.ts; this only wires
// them to the bridge's four file operations. Nothing here throws on a bad or unreadable history: it
// is a convenience, and an image must always open.
import { contentHash } from "../core/hash";
import { HISTORY_CAP, type HistoryState } from "../core/history";
import { expiryCutoff, restoreHistory, serializeHistory } from "../core/historyFile";
import type { PlatformBridge } from "../platform/bridge";

/** The history file's name: the hash of the image's Library path (case-insensitive, like Windows). */
export function historyKey(path: string): Promise<string> {
  return contentHash(new TextEncoder().encode(path.toLowerCase()));
}

export interface HistoryStore {
  /** The history to start an image with, given the PNG bytes just read from `path`. Never rejects. */
  open(path: string, png: Uint8Array): Promise<HistoryState>;
  /** Store `history` for the PNG bytes just written to `path` (no file for an empty history). Never rejects. */
  save(path: string, png: Uint8Array, history: HistoryState): Promise<void>;
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

  return {
    open: (path, png) =>
      enqueue(async () => {
        const empty: HistoryState = { undo: [], redo: [] };
        try {
          const [key, hash] = await Promise.all([historyKey(path), contentHash(png)]);
          const restored = restoreHistory(await bridge.readHistory(key), hash, now());
          if (restored.reason === "restored") {
            // Opening counts as use: stamp it so the 60 days start again.
            await bridge.writeHistory(key, serializeHistory({ hash, touchedAt: now(), history: restored.history }));
          } else if (restored.reason !== "none") {
            await quietly(() => bridge.deleteHistory(key));
          }
          return restored.history;
        } catch {
          return empty;
        }
      }),
    save: (path, png, history) =>
      enqueue(() =>
        quietly(async () => {
          const key = await historyKey(path);
          if (history.undo.length === 0 && history.redo.length === 0) return bridge.deleteHistory(key);
          const capped = { undo: history.undo.slice(-HISTORY_CAP), redo: history.redo.slice(-HISTORY_CAP) };
          await bridge.writeHistory(key, serializeHistory({ hash: await contentHash(png), touchedAt: now(), history: capped }));
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
