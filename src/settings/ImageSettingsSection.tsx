import { useEffect, useState } from "react";
import type { Background } from "../core/annotation";
import { BACKGROUND_LABELS, BACKGROUNDS, isBackground } from "../core/area";
import type { PlatformBridge } from "../platform/bridge";
import { CHECKERBOARD_THEMES, type CheckerboardTheme, type ImageSettings, isCheckerboard } from "../shared/imageSettings";

const CHECKERBOARD_LABELS: Record<CheckerboardTheme, string> = { dark: "Dark", light: "Light" };

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
    </section>
  );
}
