// The user's remapped keys as a window sees them (ticket 48): read once when the window opens, then
// kept current by the platform's change event, so a remap applies to windows that are already open.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";
import { resolveBindings, validOverrides } from "./shortcutBindings";
import type { Bindings, ShortcutContext } from "./shortcutRegistry";

type ShortcutBridge = Pick<PlatformBridge, "getShortcutOverrides" | "onShortcutOverrides">;

/**
 * The valid stored overrides, live. `set` replaces them for this window at once (the caller saves them).
 * The first read never overwrites anything newer: a change event or `set` that arrived before the read
 * returned wins. A failed read is passed to `log` and leaves the overrides empty (the defaults).
 */
export function useShortcutOverrides(bridge: ShortcutBridge, log: (message: string) => void): [Record<string, string>, (next: Record<string, string>) => void] {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const newer = useRef(false); // something fresher than the first read has been seen
  const logRef = useRef(log);
  logRef.current = log;

  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    newer.current = false;
    void bridge
      .onShortcutOverrides((stored) => {
        if (!alive) return;
        newer.current = true;
        setOverrides(validOverrides(stored));
      })
      .then((unsubscribe) => {
        if (alive) off = unsubscribe;
        else unsubscribe();
      });
    bridge.getShortcutOverrides().then(
      (stored) => alive && !newer.current && setOverrides(validOverrides(stored)),
      (e) => logRef.current(`getShortcutOverrides failed: ${e}`),
    );
    return () => {
      alive = false;
      off?.();
    };
  }, [bridge]);

  const set = useCallback((next: Record<string, string>) => {
    newer.current = true;
    setOverrides(next);
  }, []);
  return [overrides, set];
}

/** The bindings of one context under the user's overrides; the defaults until they are read, or if they cannot be. */
export function useShortcutBindings(bridge: ShortcutBridge, context: ShortcutContext, log: (message: string) => void): Bindings {
  const [overrides] = useShortcutOverrides(bridge, log);
  return useMemo(() => resolveBindings(context, overrides), [context, overrides]);
}
