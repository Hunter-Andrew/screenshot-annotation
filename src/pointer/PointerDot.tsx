import { useEffect, useRef, useState } from "react";
import "./pointer.css";
import { DEFAULT_POINTER_SETTINGS, type PlatformBridge, type PointerView } from "../platform/bridge";
import { dotStyle, POINTER_WINDOW_SIZE, RIPPLE, rippleStyle } from "./pointerStyle";

const FRESH: PointerView = { ...DEFAULT_POINTER_SETTINGS, dotX: POINTER_WINDOW_SIZE / 2, dotY: POINTER_WINDOW_SIZE / 2 };

/**
 * The pointer highlight: the red dot in its own transparent, click-through window that the platform moves with
 * the mouse pointer (ticket 50). The platform also says where in the window the dot's centre is (the window is held
 * back at a monitor's edge), when the look changes, and when a left click begins (a ripple ring grows from the dot).
 */
export function PointerDot({ bridge }: { bridge: PlatformBridge }) {
  const [view, setView] = useState<PointerView>(FRESH);
  const [ripples, setRipples] = useState<number[]>([]);
  const nextRipple = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let alive = true;
    let heardEvent = false;
    const offs: (() => void)[] = [];
    const keep = (subscription: Promise<() => void>) =>
      void subscription.then((off) => {
        if (alive) offs.push(off);
        else off();
      });
    keep(
      bridge.onPointerView((next) => {
        heardEvent = true;
        if (alive) setView(next);
      }),
    );
    keep(
      bridge.onPointerRipple(() => {
        if (!alive) return;
        const id = nextRipple.current++;
        setRipples((now) => [...now, id]);
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          setRipples((now) => now.filter((r) => r !== id));
        }, RIPPLE.durationMs);
        timers.current.add(timer);
      }),
    );
    // The window can load after the first change; ask for the current view too (an event wins).
    bridge.getPointerView().then(
      (value) => alive && !heardEvent && setView(value),
      () => {},
    );
    const pending = timers.current;
    return () => {
      alive = false;
      offs.forEach((off) => off());
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [bridge]);

  // The window is transparent: no page background may show around the dot.
  useEffect(() => {
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.backgroundColor = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
  }, []);

  const at = { left: view.dotX, top: view.dotY };
  return (
    <>
      <div role="img" aria-label="Pointer highlight" className="pointer-dot" style={{ ...at, ...dotStyle(view) }} />
      {ripples.map((id) => (
        <div key={id} data-ripple className="pointer-ripple" style={{ ...at, ...rippleStyle(view) }} />
      ))}
    </>
  );
}
