import { useEffect, useRef, useState } from "react";
import type { Background } from "../core/annotation";
import { BACKGROUND_LABELS, BACKGROUNDS, isBackground } from "../core/area";
import type { PlatformBridge } from "../platform/bridge";
import {
  CANVAS_MARGIN,
  DEFAULT_DARK_BACKGROUND,
  CHECKERBOARD_THEMES,
  CROP_MARGIN,
  type CheckerboardTheme,
  type ImageSettings,
  inRange,
  isCheckerboard,
  isDarkBackground,
  type NumberRange,
  OUTSIDE_DARKNESS,
} from "../shared/imageSettings";

const CHECKERBOARD_LABELS: Record<CheckerboardTheme, string> = { dark: "Dark", light: "Light" };

/**
 * A number field that is stored when it is left (blur or Enter) holding a number inside `range` (with no more decimal
 * places than the range keeps); anything else snaps back to the stored value. The text is kept while typing. With
 * `slider`, a slider next to the box moves the same value: the box follows it while it moves, and it is stored when it
 * is let go.
 */
function NumberSetting(props: {
  label: string;
  hint: string;
  range: NumberRange;
  value: number | undefined;
  slider?: string;
  onCommit: (value: number) => void;
}) {
  const { range, value } = props;
  const step = 1 / 10 ** (range.decimals ?? 0);
  const [draft, setDraft] = useState<string | null>(null);
  const commitText = (text: string | null) => {
    const parsed = text === null || text.trim() === "" ? NaN : Number(text);
    setDraft(null);
    if (inRange(range, parsed) && parsed !== value) props.onCommit(parsed);
  };
  const commit = () => commitText(draft);
  return (
    <p>
      <label>
        {props.label}{" "}
        <input
          type="number"
          min={range.min}
          max={range.max}
          step={step}
          style={{ width: 70 }}
          value={draft ?? value ?? ""}
          disabled={value === undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && commit()}
        />
      </label>
      {props.slider && (
        <>
          {" "}
          <input
            type="range"
            aria-label={props.slider}
            min={range.min}
            max={range.max}
            step={step}
            value={draft !== null && Number.isFinite(Number(draft)) && draft.trim() !== "" ? Number(draft) : (value ?? range.default)}
            disabled={value === undefined}
            onChange={(event) => setDraft(event.target.value)}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
        </>
      )}
      <br />
      <small>
        {props.hint} {range.min} to {range.max}.
      </small>
    </p>
  );
}

/**
 * "Image background" (what a new image starts with outside its Capture) and "Transparency checkerboard"
 * (how transparency looks in the editor and the Library). Disabled until the stored values are read;
 * another window's change shows here too.
 */
export function ImageSettingsSection({ bridge }: { bridge: PlatformBridge }) {
  const [settings, setSettings] = useState<ImageSettings | null>(null);

  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    void bridge.onImageSettings((value) => alive && setSettings(value)).then((unsubscribe) => {
      if (alive) off = unsubscribe;
      else unsubscribe();
    });
    bridge.getImageSettings().then(
      (value) => alive && setSettings((current) => current ?? value),
      (e) => void bridge.logSettings(`getImageSettings failed: ${e}`),
    );
    return () => {
      alive = false;
      off?.();
    };
  }, [bridge]);

  // The colour picker fires on every move of the pointer in its palette: show each at once, store once it settles.
  const darkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(darkTimer.current), []);
  const chooseDarkBackground = (color: string) => {
    if (!isDarkBackground(color)) return;
    setSettings((current) => (current ? { ...current, darkBackground: color } : current));
    clearTimeout(darkTimer.current);
    darkTimer.current = setTimeout(() => {
      bridge.setDarkBackground(color).catch((e) => void bridge.logSettings(`setDarkBackground failed: ${e}`));
    }, 250);
  };

  const save = (change: Partial<ImageSettings>, store: () => Promise<void>, name: string) => {
    setSettings((current) => (current ? { ...current, ...change } : current));
    store().catch((e) => void bridge.logSettings(`${name} failed: ${e}`));
  };

  return (
    <section aria-labelledby="image-heading">
      <h2 id="image-heading" style={{ fontSize: 15 }}>
        Image
      </h2>
      <p>
        <label>
          Image background{" "}
          <select
            value={settings?.background ?? ""}
            disabled={settings === null}
            onChange={(event) => {
              const next = event.target.value;
              if (!isBackground(next) || !settings) return;
              setSettings({ ...settings, background: next });
              bridge.setImageBackground(next as Background).catch((e) => void bridge.logSettings(`setImageBackground failed: ${e}`));
            }}
          >
            {settings === null && <option value="" />}
            {BACKGROUNDS.map((value) => (
              <option key={value} value={value}>
                {BACKGROUND_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <br />
        <small>What fills the area outside the Capture when an image is made bigger. Each image keeps its own once it has one.</small>
      </p>
      <p>
        <label>
          Dark image background{" "}
          <input
            type="color"
            aria-label="Dark image background"
            value={settings?.darkBackground ?? DEFAULT_DARK_BACKGROUND}
            disabled={settings === null}
            onChange={(event) => chooseDarkBackground(event.target.value)}
          />
        </label>
        <br />
        <small>The colour of an image whose background is Dark, in the editor and in exports. Applied when drawn, so it also changes images you reopen.</small>
      </p>
      <p>
        <label>
          Transparency checkerboard{" "}
          <select
            value={settings?.checkerboard ?? ""}
            disabled={settings === null}
            onChange={(event) => {
              const next = event.target.value;
              if (!isCheckerboard(next) || !settings) return;
              setSettings({ ...settings, checkerboard: next });
              bridge.setCheckerboard(next).catch((e) => void bridge.logSettings(`setCheckerboard failed: ${e}`));
            }}
          >
            {settings === null && <option value="" />}
            {CHECKERBOARD_THEMES.map((value) => (
              <option key={value} value={value}>
                {CHECKERBOARD_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <br />
        <small>How transparent areas look in the editor and the Library; never in an exported picture.</small>
      </p>
      <NumberSetting
        label="Canvas margin (px)"
        hint="Room kept around the canvas in the editor."
        range={CANVAS_MARGIN}
        value={settings?.canvasMargin}
        onCommit={(value) => save({ canvasMargin: value }, () => bridge.setCanvasMargin(value), "setCanvasMargin")}
      />
      <NumberSetting
        label="Canvas margin during crop (px)"
        hint="Room kept around the canvas while the Crop tool is on, so the handles can be dragged outwards."
        range={CROP_MARGIN}
        value={settings?.cropMargin}
        onCommit={(value) => save({ cropMargin: value }, () => bridge.setCropMargin(value), "setCropMargin")}
      />
      <NumberSetting
        label="Outside-canvas darkness (%)"
        hint="How dark the area outside the canvas is shown, to a tenth."
        range={OUTSIDE_DARKNESS}
        slider="Outside-canvas darkness slider"
        value={settings?.outsideDarkness}
        onCommit={(value) => save({ outsideDarkness: value }, () => bridge.setOutsideDarkness(value), "setOutsideDarkness")}
      />
      <p>
        <label>
          <input
            type="checkbox"
            checked={settings?.showOutsideDefault ?? true}
            disabled={settings === null}
            onChange={(event) => {
              const show = event.target.checked;
              save({ showOutsideDefault: show }, () => bridge.setShowOutsideDefault(show), "setShowOutsideDefault");
            }}
          />{" "}
          Show outside the canvas on new images
        </label>
      </p>
    </section>
  );
}