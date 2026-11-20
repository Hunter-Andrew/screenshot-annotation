import { useEffect, useState } from "react";
import { DRAWING_HIGHLIGHTER_OPACITY } from "../drawing/drawingStyles";
import type { PlatformBridge } from "../platform/bridge";
import { NumberSetting } from "./ImageSettingsSection";

/**
 * Settings > Demo tools > Drawing mode: how see-through the Highlighter is (percent, a number box and a slider). Drawing
 * mode's Highlighter takes the editor's colour and thickness but not its opacity, because the editor multiplies the
 * stroke with the picture and a transparent overlay cannot. Read when Drawing mode starts, so a change shows the next time.
 */
export function DrawingHighlighterSetting({ bridge }: { bridge: PlatformBridge }) {
  const [percent, setPercent] = useState<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    bridge.getDrawingHighlighterOpacity().then(
      (value) => alive && setPercent(value),
      (e) => void bridge.logSettings(`getDrawingHighlighterOpacity failed: ${e}`),
    );
    return () => {
      alive = false;
    };
  }, [bridge]);

  return (
    <div>
      <h3 id="drawing-highlighter-heading" style={{ fontSize: 13 }}>
        Drawing mode Highlighter
      </h3>
      <NumberSetting
        label="Highlighter opacity in Drawing mode (%)"
        hint="How solid the Highlighter is when you draw on the screen (higher is more solid). Its colour and thickness are the editor's. Applies the next time Drawing mode starts."
        range={DRAWING_HIGHLIGHTER_OPACITY}
        slider="Highlighter opacity in Drawing mode slider"
        value={percent}
        onCommit={(value) => {
          setPercent(value);
          bridge.setDrawingHighlighterOpacity(value).catch((e) => void bridge.logSettings(`setDrawingHighlighterOpacity failed: ${e}`));
        }}
      />
    </div>
  );
}
