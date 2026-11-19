import { Countdown } from "./countdown/Countdown";
import { DrawingOverlay } from "./drawing/DrawingOverlay";
import { Editor } from "./editor/Editor";
import type { PlatformBridge } from "./platform/bridge";
import { Settings } from "./settings/Settings";
import { Overlay } from "./overlay/Overlay";
import { COUNTDOWN_HASH, DRAWING_HASH_PREFIX, OVERLAY_HASH_PREFIX, SETTINGS_HASH } from "./shared/constants";

/** The Settings window loads this same page at `SETTINGS_HASH`; every other URL is the editor. */
export function App({ bridge }: { bridge: PlatformBridge }) {
  const { hash } = window.location;
  if (hash.startsWith(OVERLAY_HASH_PREFIX)) {
    return <Overlay bridge={bridge} monitor={Number(hash.slice(OVERLAY_HASH_PREFIX.length)) || 0} />;
  }
  if (hash.startsWith(DRAWING_HASH_PREFIX)) {
    return <DrawingOverlay bridge={bridge} monitor={Number(hash.slice(DRAWING_HASH_PREFIX.length)) || 0} />;
  }
  if (hash === SETTINGS_HASH) {
    return <Settings bridge={bridge} />;
  }
  if (hash === COUNTDOWN_HASH) {
    return <Countdown bridge={bridge} />;
  }
  return <Editor bridge={bridge} />;
}
