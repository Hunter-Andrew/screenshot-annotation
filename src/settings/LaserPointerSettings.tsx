import { useEffect, useState } from "react";
import { LASER_POINTER_SIZES, type PlatformBridge, type LaserPointerSettings, type LaserPointerSize } from "../platform/bridge";
import { ColorField } from "../editor/style/ColorField";

const SIZE_LABELS: Record<LaserPointerSize, string> = { small: "Small", medium: "Medium", large: "Large" };

/**
 * Settings > Demo tools > the laser pointer's look (ticket 50): colour (the editor's palette, picker and hex
 * field), size and the click ripple, each stored at once and shown on a visible Laser pointer at once. Also a switch that
 * shows whether the highlight is on (the hotkey and the tray item change it too) so the look can be tried here.
 */
export function LaserPointerSettings({ bridge }: { bridge: PlatformBridge }) {
  const [look, setLook] = useState<LaserPointerSettings | null>(null);
  const [on, setOn] = useState(false);
  const [hideCursor, setHideCursor] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    let heardEvent = false;
    void bridge
      .onLaserPointer((value) => {
        heardEvent = true;
        if (alive) setOn(value);
      })
      .then((unsubscribe) => {
        if (alive) off = unsubscribe;
        else unsubscribe();
      });
    bridge.getLaserPointer().then(
      (value) => alive && !heardEvent && setOn(value),
      (e) => void bridge.logSettings(`getLaserPointer failed: ${e}`),
    );
    bridge.getLaserPointerHideCursor().then(
      (value) => alive && setHideCursor(value),
      (e) => void bridge.logSettings(`getLaserPointerHideCursor failed: ${e}`),
    );
    bridge.getLaserPointerSettings().then(
      (value) => alive && setLook((now) => now ?? value),
      (e) => void bridge.logSettings(`getLaserPointerSettings failed: ${e}`),
    );
    return () => {
      alive = false;
      off?.();
    };
  }, [bridge]);

  const change = (patch: Partial<LaserPointerSettings>) => {
    if (look === null) return;
    const next = { ...look, ...patch };
    setLook(next);
    bridge.setLaserPointerSettings(next).catch((e) => void bridge.logSettings(`setLaserPointerSettings failed: ${e}`));
  };

  return (
    <div>
      <h3 id="laser-pointer-look-heading" style={{ fontSize: 13 }}>
        Laser pointer look
      </h3>
      <label>
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => {
            const next = event.target.checked;
            setOn(next);
            bridge.setLaserPointer(next).catch((e) => void bridge.logSettings(`setLaserPointer failed: ${e}`));
          }}
        />{" "}
        Laser pointer is on
      </label>
      <p className="muted">Off at every start. Switch it on here, from the tray menu or with its hotkey to see changes on the Laser pointer.</p>
      <ColorField label="Pointer color" color={look?.color ?? "#e02424"} onPick={(color) => change({ color })} />
      <fieldset disabled={look === null} style={{ border: 0, padding: 0, margin: "8px 0" }}>
        <legend>Size</legend>
        {LASER_POINTER_SIZES.map((size) => (
          <label key={size} style={{ marginRight: 12 }}>
            <input type="radio" name="laser-pointer-size" checked={look?.size === size} onChange={() => change({ size })} />{" "}
            {SIZE_LABELS[size]}
          </label>
        ))}
      </fieldset>
      <label>
        <input
          type="checkbox"
          disabled={look === null}
          checked={look?.ripple === true}
          onChange={(event) => change({ ripple: event.target.checked })}
        />{" "}
        Show a ripple when I left-click
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          disabled={hideCursor === null}
          checked={hideCursor === true}
          onChange={(event) => {
            const hide = event.target.checked;
            setHideCursor(hide);
            bridge.setLaserPointerHideCursor(hide).catch((e) => void bridge.logSettings(`setLaserPointerHideCursor failed: ${e}`));
          }}
        />{" "}
        Hide the Windows mouse arrow while the dot is on
      </label>
      <p className="muted">Only the dot shows. The arrow comes back when the highlight is switched off or the app exits (and at the next start if the app was killed).</p>
    </div>
  );
}
