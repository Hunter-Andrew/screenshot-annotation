import { useEffect, useState } from "react";
import "./settings.css";
import type { PlatformBridge } from "../platform/bridge";
import { MAIN_STYLE, RELEASES_URL, SHORTCUTS_HASH } from "../shared/constants";
import { ShortcutsSection } from "./ShortcutsSection";
import { DemoHotkeys, DemoToolsSection } from "./DemoToolsSection";
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

  const [screen, setScreen] = useState<"main" | "shortcuts">(() => (window.location.hash === SHORTCUTS_HASH ? "shortcuts" : "main"));

  // Every hotkey setting lives on its own screen, opened from the main one.
  if (screen === "shortcuts") {
    return (
      <main className="settings" style={MAIN_STYLE}>
        <button type="button" onClick={() => setScreen("main")}>
          ← Back to Settings
        </button>
        <h1 style={{ fontSize: 18 }}>Keyboard shortcuts</h1>
        <ShortcutsSection bridge={bridge} extra={<DemoHotkeys bridge={bridge} />} />
        <PrintScreenNotice bridge={bridge} />
      </main>
    );
  }

  return (
    <main className="settings" style={MAIN_STYLE}>
      <h1 style={{ fontSize: 18 }}>Settings</h1>
      <section aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading" style={{ fontSize: 15 }}>
          Shortcuts
        </h2>
        <button type="button" onClick={() => setScreen("shortcuts")}>
          Bind keyboard shortcuts…
        </button>
      </section>
      <DemoToolsSection bridge={bridge} />
      <MagnifierSetting bridge={bridge} />
      <ImageSettingsSection bridge={bridge} />
      <LaunchAtSignIn bridge={bridge} />
      <LibraryFolder bridge={bridge} />
      <ResetToolStyles bridge={bridge} />
      <section aria-labelledby="about-heading">
        <h2 id="about-heading" style={{ fontSize: 15 }}>
          About
        </h2>
        <p>Sigil (Screenshot Annotation)</p>
        <p>{version === null ? "Version …" : `Version ${version}`}</p>
        <button type="button" onClick={() => void bridge.openUrl(RELEASES_URL)}>
          Check for updates
        </button>
      </section>
    </main>
  );
}
