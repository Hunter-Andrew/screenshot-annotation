import { useEffect, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";

/**
 * The delay timer's countdown badge: a small round number in its own transparent, click-through
 * window that follows the mouse pointer (the platform moves it and sends the numbers). It shows
 * nothing once the countdown is over; the platform closes the window before the screen is read.
 */
export function Countdown({ bridge }: { bridge: PlatformBridge }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    let heardEvent = false;
    void bridge
      .onCountdown((value) => {
        heardEvent = true;
        if (alive) setRemaining(value);
      })
      .then((unsubscribe) => {
        if (alive) off = unsubscribe;
        else unsubscribe();
      });
    // The window can load after the first tick; ask for the current number too (an event wins).
    bridge.getCountdown().then(
      (value) => alive && !heardEvent && setRemaining((now) => now ?? value),
      () => {},
    );
    return () => {
      alive = false;
      off?.();
    };
  }, [bridge]);

  // The window is transparent: no page background may show around the badge.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
  }, []);

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        inset: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: "rgba(0, 0, 0, 0.78)",
        border: "2px solid rgba(255, 255, 255, 0.9)",
        color: "#fff",
        font: "700 34px system-ui, sans-serif",
        userSelect: "none",
        ...(remaining === null ? { visibility: "hidden" } : {}),
      }}
    >
      {remaining}
    </div>
  );
}
