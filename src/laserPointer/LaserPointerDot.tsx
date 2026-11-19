import { useEffect, useRef, useState } from "react";
import "./laserPointer.css";
import { DEFAULT_LASER_POINTER_SETTINGS, type PlatformBridge, type LaserPointerView } from "../platform/bridge";
import { laserStyles, LASER_POINTER_WINDOW_SIZE, RIPPLE, rippleStyle } from "./laserPointerStyle";

const FRESH: LaserPointerView = { ...DEFAULT_LASER_POINTER_SETTINGS, dotX: LASER_POINTER_WINDOW_SIZE / 2, dotY: LASER_POINTER_WINDOW_SIZE / 2 };

/**
 * The laser pointer: the Laser pointer (a hot core, a wide haze and a thin ring, ticket 40 decision 14) in its own transparent, click-through window that the platform moves with
 * the mouse pointer (ticket 50). The platform also says where in the window the dot's centre is (the window is held
 * back at a monitor's edge), when the look changes, and when a left click begins (a ripple ring grows from the dot).
 */
export function LaserPointerDot({ bridge }: { bridge: PlatformBridge }) {
  const [view, setView] = useState<LaserPointerView>(FRESH);
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
      bridge.onLaserPointerView((next) => {
        heardEvent = true;
        if (alive) setView(next);
      }),
    );
    keep(
      bridge.onLaserPointerRipple(() => {
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
    bridge.getLaserPointerView().then(
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
  const layers = laserStyles(view);
  return (
    <>
      <div role="img" aria-label="Laser pointer" className="laser-pointer-dot" style={at}>
        <div className="laser-pointer-layer" data-layer="haze" style={layers.haze} />
        <div className="laser-pointer-layer" data-layer="ring" style={layers.ring} />
        <div className="laser-pointer-layer" data-layer="hot" style={layers.hot} />
      </div>
      {ripples.map((id) => (
        <div key={id} data-ripple className="laser-pointer-ripple" style={{ ...at, ...rippleStyle(view) }} />
      ))}
    </>
  );
}
