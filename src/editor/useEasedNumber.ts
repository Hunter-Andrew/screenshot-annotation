// A number that glides to its target instead of jumping, used for the editor's canvas margin so entering or leaving
// the Crop tool re-fits the view smoothly. It glides only when `transitionKey` changed together with the target (the
// tool changed); a target that changes alone (the setting edited in another window) is taken at once. Without
// `requestAnimationFrame`, or with the system's "reduce motion" on, it always jumps.
import { useEffect, useRef, useState } from "react";

export const EASE_MS = 180;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

export function useEasedNumber(target: number, transitionKey: unknown, durationMs: number = EASE_MS): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const lastKey = useRef(transitionKey);
  shownRef.current = shown;

  useEffect(() => {
    const keyChanged = lastKey.current !== transitionKey;
    lastKey.current = transitionKey;
    if (shownRef.current === target) return;
    if (!keyChanged || durationMs <= 0 || typeof requestAnimationFrame === "undefined" || prefersReducedMotion()) {
      setShown(target);
      return;
    }
    const from = shownRef.current;
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / durationMs);
      setShown(t >= 1 ? target : Math.round(from + (target - from) * easeInOut(t)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, transitionKey, durationMs]);

  return shown;
}
