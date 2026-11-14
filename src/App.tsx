import type { PlatformBridge } from "./platform/bridge";
import { Settings } from "./settings/Settings";

/** The Settings window loads this same page at `#settings`. */
export function App({ bridge }: { bridge: PlatformBridge }) {
  if (window.location.hash === "#settings") {
    return <Settings bridge={bridge} />;
  }
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <p>Screenshot Annotation is running in the tray.</p>
    </main>
  );
}
