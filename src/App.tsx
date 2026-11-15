import { Editor } from "./editor/Editor";
import type { PlatformBridge } from "./platform/bridge";
import { Settings } from "./settings/Settings";
import { SETTINGS_HASH } from "./shared/constants";

/** The Settings window loads this same page at `SETTINGS_HASH`; every other URL is the editor. */
export function App({ bridge }: { bridge: PlatformBridge }) {
  if (window.location.hash === SETTINGS_HASH) {
    return <Settings bridge={bridge} />;
  }
  return <Editor bridge={bridge} />;
}
