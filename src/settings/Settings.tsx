import { useEffect, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";
import { MAIN_STYLE, RELEASES_URL } from "../shared/constants";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { LaunchAtSignIn } from "./LaunchAtSignIn";
import { ImageSettingsSection } from "./ImageSettingsSection";
import { LibraryFolder } from "./LibraryFolder";
import { MagnifierSetting } from "./MagnifierSetting";
import { ResetToolStyles } from "./ResetToolStyles";
import { PrintScreenNotice } from "./PrintScreenNotice";

export function Settings({ bridge }: { bridge: PlatformBridge }) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    void bridge.getVersion().then(setVersion);
  }, [bridge]);

  return (
    <main style={MAIN_STYLE}>
      <h1 style={{ fontSize: 18 }}>Settings</h1>
      <HotkeyRecorder bridge={bridge} />
      <PrintScreenNotice bridge={bridge} />
      <MagnifierSetting bridge={bridge} />
      <ImageSettingsSection bridge={bridge} />
      <LaunchAtSignIn bridge={bridge} />
      <LibraryFolder bridge={bridge} />
      <ResetToolStyles bridge={bridge} />
      <section aria-labelledby="about-heading">
        <h2 id="about-heading" style={{ fontSize: 15 }}>
          About
        </h2>
        <p>Screenshot Annotation</p>
        <p>{version === null ? "Version …" : `Version ${version}`}</p>
        <button type="button" onClick={() => void bridge.openUrl(RELEASES_URL)}>
          Check for updates
        </button>
      </section>
    </main>
  );
}
