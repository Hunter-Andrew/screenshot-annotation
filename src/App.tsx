import type { PlatformBridge } from "./platform/bridge";
import { Settings } from "./settings/Settings";
import { MAIN_STYLE, SETTINGS_HASH } from "./shared/constants";

/** The Settings window loads this same page at `SETTINGS_HASH`. */
export function App({ bridge }: { bridge: PlatformBridge }) {
  if (window.location.hash === SETTINGS_HASH) {
    return <Settings bridge={bridge} />;
  }
  return (
    <main style={MAIN_STYLE}>
      <p>Screenshot Annotation is running in the tray.</p>
    </main>
  );
}
