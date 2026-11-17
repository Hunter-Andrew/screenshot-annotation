// Deleting images from the Library Strip, the grid, or with Discard (ticket 15): every delete moves the
// files to the Windows Recycle Bin with no confirmation, then offers Undo for a few seconds.
//
// Undo writes the files back from copies the platform keeps until the notice is over. An image's undo
// history is deleted only then (not at once), so an Undo brings back the image with its history.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";
import { type LibraryImage, neighbourAfterRemoval } from "./libraryModel";

/** How long the Undo notice stays. */
export const UNDO_NOTICE_MS = 8000;

/** What this needs from the editor. */
export interface DeletePorts {
  bridge: Pick<PlatformBridge, "trashLibraryFiles" | "restoreLibraryFiles" | "forgetTrashedFiles">;
  /** Delete the undo history stored for an image (never rejects). */
  removeHistory: (path: string) => Promise<void>;
  /** The image open in the editor, with the persister that owns its file. */
  getOpen: () => { persister: { readonly path: string | null; discard(): Promise<void> } } | null;
  getImages: () => LibraryImage[];
  refresh: () => Promise<LibraryImage[]>;
  /** The open image was deleted: close it, then show `next` (a Library path), or the empty state for null. */
  afterOpenDeleted: (next: string | null) => Promise<void>;
  /** Open an image (Undo of a deleted open image shows it again). */
  open: (path: string) => Promise<void>;
  report: (message: string) => void;
}

export interface UndoNoticeState {
  count: number;
}

export interface DeleteWithUndo {
  notice: UndoNoticeState | null;
  /** Delete these files (not the open image unless it is among them). Resolves when done. */
  deletePaths: (paths: string[]) => Promise<void>;
  /** Discard: delete the open image. */
  discardOpen: () => Promise<void>;
  undo: () => Promise<void>;
}

interface Pending {
  paths: string[];
  /** The deleted image that was open, so Undo shows it again. */
  reopen: string | null;
}

export function useDeleteWithUndo(ports: DeletePorts, noticeMs: number = UNDO_NOTICE_MS): DeleteWithUndo {
  const latest = useRef(ports);
  latest.current = ports;
  const [notice, setNotice] = useState<UndoNoticeState | null>(null);
  const pending = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  /** The notice is over (expired, or a newer delete replaced it): the deleted images are gone for good. */
  const finalize = useCallback(async () => {
    const p = pending.current;
    clearTimer();
    pending.current = null;
    setNotice(null);
    if (!p) return;
    const { bridge, removeHistory } = latest.current;
    await bridge.forgetTrashedFiles(p.paths).catch(() => {});
    await Promise.all(p.paths.map((path) => removeHistory(path)));
  }, []);

  useEffect(() => clearTimer, []);

  const run = useCallback(
    async (paths: string[], discardOpen: boolean) => {
      if (busy.current) return;
      busy.current = true;
      const { bridge, getOpen, getImages, refresh, afterOpenDeleted, report } = latest.current;
      try {
        await finalize();
        const before = getImages();
        const open = getOpen();
        let openPath = open?.persister.path ?? null;
        const trashed: string[] = [];
        let openDeleted = false;
        let deletedOpenPath: string | null = null;

        if (open && (discardOpen || (openPath !== null && paths.includes(openPath)))) {
          // Waits for a save in flight, then moves that very file; a failure leaves everything as it was.
          await open.persister.discard();
          openDeleted = true;
          deletedOpenPath = open.persister.path;
          if (deletedOpenPath) trashed.push(deletedOpenPath);
          openPath = deletedOpenPath ?? openPath;
        }
        const others = paths.filter((p) => !(openDeleted && p === openPath));
        let failure: string | null = null;
        if (others.length > 0) {
          try {
            trashed.push(...(await bridge.trashLibraryFiles(others)));
          } catch (e) {
            failure = e instanceof Error ? e.message : String(e);
          }
        }

        if (trashed.length > 0) {
          pending.current = { paths: trashed, reopen: deletedOpenPath };
          setNotice({ count: trashed.length });
          timer.current = setTimeout(() => void finalize(), noticeMs);
        }
        await refresh();
        if (openDeleted) {
          await afterOpenDeleted(neighbourAfterRemoval(before, new Set(trashed), openPath ?? ""));
        }
        if (failure !== null) report(`Could not delete everything: ${failure}`);
        else if (discardOpen) report("Discarded (moved to the Recycle Bin)");
        else if (trashed.length > 0) report(trashed.length === 1 ? "Deleted 1 image" : `Deleted ${trashed.length} images`);
      } catch (e) {
        report(`${discardOpen ? "Could not discard" : "Could not delete"}: ${String(e)}`);
      } finally {
        busy.current = false;
      }
    },
    [finalize, noticeMs],
  );

  const undo = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    clearTimer();
    pending.current = null;
    setNotice(null);
    const { bridge, removeHistory, refresh, open, report } = latest.current;
    try {
      const restored = await bridge.restoreLibraryFiles(p.paths);
      // Whatever could not be restored is gone for good (it is still in the Recycle Bin): its history goes too.
      const missed = p.paths.filter((path) => !restored.some((r) => r.from === path));
      await bridge.forgetTrashedFiles(p.paths).catch(() => {});
      await Promise.all(missed.map((path) => removeHistory(path)));
      await refresh();
      const back = p.reopen === null ? undefined : restored.find((r) => r.from === p.reopen);
      if (back) await open(back.to);
      report(
        missed.length === 0
          ? restored.length === 1
            ? "Restored 1 image"
            : `Restored ${restored.length} images`
          : `Restored ${restored.length} of ${p.paths.length} images; the rest are in the Recycle Bin`,
      );
    } catch (e) {
      report(`Could not undo: ${String(e)}`);
    }
  }, []);

  return {
    notice,
    deletePaths: useCallback((paths) => run(paths, false), [run]),
    discardOpen: useCallback(() => run([], true), [run]),
    undo,
  };
}
