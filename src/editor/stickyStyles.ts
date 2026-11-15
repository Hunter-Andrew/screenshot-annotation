// Sticky tool styles: each tool remembers its last style across restarts. They live in the app's
// settings (settings.json, through the bridge), which treats them as opaque; this file reads them
// defensively (`sanitizeStyle`) and writes them back after a short pause, so dragging the color
// picker or the opacity slider does not write a file per pixel of movement.
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef } from "react";
import { kindOf } from "../core/annotations";
import { sanitizeStyle, type Style } from "../core/propertyGroups";
import type { PlatformBridge } from "../platform/bridge";

const SAVE_DELAY_MS = 300;

export function useStickyStyles(
  bridge: PlatformBridge,
  setToolStyles: Dispatch<SetStateAction<Record<string, Style>>>,
): { remember(type: string, style: Style): void } {
  // Everything the settings held, so tools this build does not know (a newer version's) are written back untouched.
  const stored = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const flush = useMemo(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      if (!dirty.current) return;
      dirty.current = false;
      bridge.setToolStyles(stored.current).catch(() => {});
    },
    [bridge],
  );

  useEffect(() => {
    let cancelled = false;
    bridge.getToolStyles().then(
      (raw) => {
        if (cancelled || typeof raw !== "object" || raw === null) return;
        stored.current = { ...raw, ...stored.current };
        const known: Record<string, Style> = {};
        for (const [type, value] of Object.entries(raw)) if (kindOf(type)) known[type] = sanitizeStyle(value);
        // Whatever the user already changed while this was loading wins.
        setToolStyles((now) => ({ ...known, ...now }));
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [bridge, setToolStyles]);

  // A change not yet stored is not lost when the window is hidden or closed.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return useMemo(
    () => ({
      remember(type, style) {
        stored.current = { ...stored.current, [type]: style };
        dirty.current = true;
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
      },
    }),
    [flush],
  );
}
