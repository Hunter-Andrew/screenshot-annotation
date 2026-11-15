import { useEffect, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";

/**
 * "Show the magnifier in the capture overlay": the same stored value the overlay's M key flips.
 * Disabled until the stored value has been read, so it never shows a guess.
 */
export function MagnifierSetting({ bridge }: { bridge: PlatformBridge }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    void bridge.onOverlayMagnifier((value) => alive && setEnabled(value)).then((unsubscribe) => {
      if (alive) off = unsubscribe;
      else unsubscribe();
    });
    bridge.getMagnifier().then(
      (value) => alive && setEnabled((current) => current ?? value),
      (e) => void bridge.logSettings(`getMagnifier failed: ${e}`),
    );
    return () => {
      alive = false;
      off?.();
    };
  }, [bridge]);

  return (
    <section aria-labelledby="magnifier-heading">
      <h2 id="magnifier-heading" style={{ fontSize: 15 }}>
        Capture overlay
      </h2>
      <label>
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null}
          onChange={(event) => {
            const next = event.target.checked;
            setEnabled(next);
            bridge.setMagnifier(next).catch((e) => void bridge.logSettings(`setMagnifier failed: ${e}`));
          }}
        />{" "}
        Show the magnifier in the capture overlay
      </label>
    </section>
  );
}
