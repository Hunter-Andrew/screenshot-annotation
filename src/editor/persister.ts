// Keeps one Annotated Image's Library PNG up to date (ADR 0004): the first save of a new Capture,
// the debounced auto-save about 1 s after an edit, and Discard.
//
// All three go through ONE serial queue per image, which is what makes them race-free:
//  - an edit made while the first save is in flight waits for it and then updates the same file
//    (it can never create a second one);
//  - an auto-save is never interleaved with another write of the same file;
//  - Discard waits for whatever is in flight, then moves that very file to the Recycle Bin, and from
//    then on nothing is written for this image (the Rust side also refuses to create a missing file).
// Pure TypeScript apart from the timers, so it is tested with fake timers and the fake bridge.
import { encodeLibraryPng, type FinishedRenderer, usedImageIds } from "../core/annotatedImage";
import type { EditSession } from "../core/editSession";
import type { HistoryState } from "../core/history";
import type { PlatformBridge } from "../platform/bridge";

export const AUTOSAVE_DELAY_MS = 1000;

export type PersisterEvent =
  | { kind: "saved"; path: string; first: boolean }
  | { kind: "error"; message: string; first: boolean };

export interface PersisterOptions {
  bridge: Pick<PlatformBridge, "saveToLibrary" | "updateLibraryFile" | "discardLibraryFile">;
  session: EditSession;
  capturedAt: Date;
  render?: FinishedRenderer;
  /** The Library file this image was opened from; omit for a new Capture, which `start` saves. */
  path?: string;
  /** Saved by a newer version of the app: show it, never write it. */
  readOnly?: boolean;
  delayMs?: number;
  /**
   * Called after each successful write with the PNG bytes written and the undo history as it was
   * when they were encoded (so the two always belong together). Not awaited; a
   * failure is ignored: it never fails the save.
   */
  onSaved?: (saved: {
    path: string;
    png: Uint8Array;
    history: HistoryState;
    /** Every pasted image the session held then, by `imageId` (ticket 38). */
    images: Readonly<Record<string, Uint8Array>>;
    /** The ids of the pasted images the PNG itself carries. */
    embedded: string[];
  }) => void | Promise<void>;
  onEvent?: (event: PersisterEvent) => void;
}

export interface Persister {
  /** The Library file, once there is one. */
  readonly path: string | null;
  /**
   * Save a new Capture to the Library: resolves to its path, or null if it was discarded before the
   * save began; rejects if the save fails. A no-op (resolving to the path) for an opened file.
   */
  start(): Promise<string | null>;
  /** The image changed: auto-save about 1 s after the last call. */
  markDirty(): void;
  /** Save a pending edit now. Never rejects; failures arrive as events. */
  flush(): Promise<void>;
  /** Cancel auto-save, wait for any write in flight, and move the file to the Recycle Bin. Rejects (and keeps saving) if that fails. */
  discard(): Promise<void>;
  /**
   * The file is gone already (deleted in Explorer): stop for good, with no write and no Recycle Bin call.
   * Edits made to the image since the last save are lost with it.
   */
  abandon(): void;
}

export function createPersister(options: PersisterOptions): Persister {
  const { bridge, session, capturedAt, render, readOnly = false, delayMs = AUTOSAVE_DELAY_MS } = options;
  let path = options.path ?? null;
  let dirty = false;
  let discarding = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const emit = (event: PersisterEvent) => options.onEvent?.(event);
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  /** Write the image as it is now. Runs inside the queue. */
  const write = async (): Promise<void> => {
    if (discarding || readOnly) return;
    const first = path === null;
    // Cleared before encoding, so an edit made while this writes marks the image dirty again.
    dirty = false;
    try {
      // As of the image encoded next, whatever is edited while it renders.
      const { history, image } = session;
      const png = await encodeLibraryPng(image, render);
      if (discarding) return;
      if (path === null) path = await bridge.saveToLibrary(png, capturedAt);
      else await bridge.updateLibraryFile(path, png);
      emit({ kind: "saved", path, first });
      // Not awaited: the next save must not wait for the history file (the history store keeps its own
      // order). Undo history is best-effort; a failure never touches the saved image.
      try {
        void Promise.resolve(options.onSaved?.({ path, png, history, images: image.images ?? {}, embedded: usedImageIds(image.model) })).catch(() => {});
      } catch {
        // A synchronous throw, likewise ignored.
      }
    } catch (e) {
      dirty = true;
      throw Object.assign(new Error(e instanceof Error ? e.message : String(e)), { first });
    }
  };

  /** An auto-save or flush: failures are reported, not thrown; the edit stays pending. */
  const writeIfDirty = async (): Promise<void> => {
    if (!dirty) return;
    try {
      await write();
    } catch (e) {
      emit({ kind: "error", message: (e as Error).message, first: (e as { first?: boolean }).first === true });
    }
  };

  return {
    get path() {
      return path;
    },
    start: async () => {
      if (path !== null) return path;
      dirty = true;
      await enqueue(write);
      return path;
    },
    markDirty() {
      if (readOnly) return;
      dirty = true;
      if (discarding) return; // re-armed if the Discard fails
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void enqueue(writeIfDirty);
      }, delayMs);
    },
    flush() {
      clearTimer();
      return enqueue(writeIfDirty);
    },
    abandon() {
      discarding = true; // never cleared: nothing is written for this image again
      dirty = false;
      clearTimer();
    },
    async discard() {
      discarding = true;
      clearTimer();
      try {
        await enqueue(async () => {
          if (path !== null) await bridge.discardLibraryFile(path);
        });
      } catch (e) {
        discarding = false;
        if (dirty) this.markDirty();
        throw e;
      }
    },
  };
}
