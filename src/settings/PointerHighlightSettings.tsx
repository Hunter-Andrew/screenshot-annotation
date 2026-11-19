import { useEffect, useState } from "react";
import { POINTER_SIZES, type PlatformBridge, type PointerSettings, type PointerSize } from "../platform/bridge";
import { ColorField } from "../editor/style/ColorField";

const SIZE_LABELS: Record<PointerSize, string> = { small: "Small", medium: "Medium", large: "Large" };

/**
 * Settings > Demo tools > the pointer highlight's look (ticket 50): colour (the editor's palette, picker and hex
 * field), size and the click ripple, each stored at once and shown on a visible dot at once. Also a switch that
 * shows whether the highlight is on (the hotkey and the tray item change it too) so the look can be tried here.
 */
export function PointerHighlightSettings({ bridge }: { bridge: PlatformBridge }) {
  const [look, setLook] = useState<PointerSettings | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    let heardEvent = false;
    void bridge
      .onPointerHighlight((value) => {
        heardEvent = true;
        if (alive) setOn(value);
      })
      .then((unsubscribe) => {
        if (alive) off = unsubscribe;
        else unsubscribe();
      });
    bridge.getPointerHighlight().then(
      (value) => alive && !heardEvent && setOn(value),
      (e) => void bridge.logSettings(`getPointerHighlight failed: ${e}`),
    );
    bridge.getPointerSettings().then(
      (value) => alive && setLook((now) => now ?? value),
      (e) => void bridge.logSettings(`getPointerSettings failed: ${e}`),
    );
    return () => {
      alive = false;
      off?.();
    };
  }, [bridge]);

  const change = (patch: Partial<PointerSettings>) => {
    if (look === null) return;
    const next = { ...look, ...patch };
    setLook(next);
    bridge.setPointerSettings(next).catch((e) => void bridge.logSettings(`setPointerSettings failed: ${e}`));
  };

  return (
    <div>
      <h3 id="pointer-look-heading" style={{ fontSize: 13 }}>
        Pointer highlight look
      </h3>
      <label>
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => {
            const next = event.target.checked;
            setOn(next);
            bridge.setPointerHighlight(next).catch((e) => void bridge.logSettings(`setPointerHighlight failed: ${e}`));
          }}
        />{" "}
        Pointer highlight is on
      </label>
      <p className="muted">Off at every start. Switch it on here, from the tray menu or with its hotkey to see changes on the dot.</p>
      <ColorField label="Pointer color" color={look?.color ?? "#e02424"} onPick={(color) => change({ color })} />
      <fieldset disabled={look === null} style={{ border: 0, padding: 0, margin: "8px 0" }}>
        <legend>Size</legend>
        {POINTER_SIZES.map((size) => (
          <label key={size} style={{ marginRight: 12 }}>
            <input type="radio" name="pointer-size" checked={look?.size === size} onChange={() => change({ size })} />{" "}
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
    </div>
  );
}
