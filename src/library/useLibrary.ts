import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";
import { type LibraryImage, sameLibrary, toLibraryImages } from "./libraryModel";

export interface LibraryList {
  /** Every Annotated Image in the Library folder, newest capture first. */
  images: LibraryImage[];
  /** The first listing has come back (until then an empty list means "not known yet", not "no images"). */
  loaded: boolean;
  /** The list as of the latest listing, readable from callbacks that outlive a render. */
  getImages: () => LibraryImage[];
  /**
   * List the folder again. Requests made while a listing is running share one follow-up listing, so a
   * burst of changes costs two, not many; the promise resolves with a list read after the call.
   */
  refresh: () => Promise<LibraryImage[]>;
}

/** The Library folder as a live list (tickets 14 and 17): read at start, and read again whenever the platform says it changed. */
export function useLibrary(bridge: Pick<PlatformBridge, "listLibrary" | "onLibraryChanged">): LibraryList {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef<LibraryImage[]>([]);
  const mounted = useRef(true);
  const chain = useRef<{ running: Promise<LibraryImage[]> | null; next: Promise<LibraryImage[]> | null }>({
    running: null,
    next: null,
  });

  const list = useCallback(async (): Promise<LibraryImage[]> => {
    try {
      const next = toLibraryImages(await bridge.listLibrary());
      if (!sameLibrary(latest.current, next) || latest.current.length !== next.length) {
        latest.current = next;
        if (mounted.current) setImages(next);
      }
      if (mounted.current) setLoaded(true);
    } catch {
      // The folder could not be read this time (unplugged drive, a sync client mid-update): keep what is shown.
    }
    return latest.current;
  }, [bridge]);

  const refresh = useCallback(() => {
    const c = chain.current;
    const start = () => {
      const run = list().finally(() => {
        if (c.running === run) c.running = null;
      });
      c.running = run;
      return run;
    };
    if (!c.running) return start();
    if (!c.next) {
      c.next = c.running.then(() => {
        c.next = null;
        return start();
      });
    }
    return c.next;
  }, [list]);

  useEffect(() => {
    mounted.current = true;
    let off: (() => void) | undefined;
    let cancelled = false;
    void refresh();
    void bridge.onLibraryChanged(() => void refresh()).then(
      (unsubscribe) => (cancelled ? unsubscribe() : (off = unsubscribe)),
      () => {},
    );
    return () => {
      cancelled = true;
      mounted.current = false;
      off?.();
    };
  }, [bridge, refresh]);

  const getImages = useCallback(() => latest.current, []);
  return { images, loaded, getImages, refresh };
}
