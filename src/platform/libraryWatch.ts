/**
 * Follow the Library folder (ticket 17): poll a cheap change signature, and call `onChange` when it
 * differs from the last one seen. Used by the real bridge; the signature comes from the platform
 * (file names, times and sizes only, no file is opened).
 *
 * Polling is paused while the window is hidden (the editor is kept pre-warmed in the tray, ADR 0003),
 * and a check runs at once when the window is shown or focused again, so coming back to the app
 * always shows the folder as it is now.
 */
export interface LibraryWatchOptions {
  readSignature: () => Promise<string>;
  onChange: () => void;
  intervalMs?: number;
  /** For tests. */
  doc?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  win?: Pick<Window, "addEventListener" | "removeEventListener">;
}

export const LIBRARY_POLL_MS = 2000;

export function watchLibrary(options: LibraryWatchOptions): () => void {
  const { readSignature, onChange, intervalMs = LIBRARY_POLL_MS } = options;
  const doc = options.doc ?? document;
  const win = options.win ?? window;
  let last: string | null = null;
  let stopped = false;
  let checking = false;

  const check = async () => {
    // One check at a time: a slow folder must not pile requests up.
    if (stopped || checking || doc.visibilityState === "hidden") return;
    checking = true;
    try {
      const now = await readSignature();
      if (stopped) return;
      const changed = last !== null && now !== last;
      last = now;
      if (changed) onChange();
    } catch {
      // The folder was unreachable this time; the next check tries again.
    } finally {
      checking = false;
    }
  };

  const timer = setInterval(() => void check(), intervalMs);
  const onVisible = () => void check();
  doc.addEventListener("visibilitychange", onVisible);
  win.addEventListener("focus", onVisible);
  void check(); // the baseline: what the folder looks like now
  return () => {
    stopped = true;
    clearInterval(timer);
    doc.removeEventListener("visibilitychange", onVisible);
    win.removeEventListener("focus", onVisible);
  };
}
