import { useEffect, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";

/**
 * "Launch at sign-in" (default on): start the app, into the tray, when the user signs in to Windows
 * (a value in the per-user Run key). Disabled until the stored value has been read; a change Windows
 * refuses puts the box back and says why.
 */
export function LaunchAtSignIn({ bridge }: { bridge: PlatformBridge }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    bridge.getLaunchAtSignIn().then(
      (value) => alive && setEnabled(value),
      (e) => void bridge.logSettings(`getLaunchAtSignIn failed: ${e}`),
    );
    return () => {
      alive = false;
    };
  }, [bridge]);

  const change = async (next: boolean) => {
    const before = enabled;
    setEnabled(next);
    setProblem(null);
    try {
      await bridge.setLaunchAtSignIn(next);
    } catch (e) {
      setEnabled(before);
      const detail = e instanceof Error ? e.message : String(e);
      setProblem(`Could not change launch at sign-in: ${detail}`);
      void bridge.logSettings(`setLaunchAtSignIn(${next}) failed: ${detail}`);
    }
  };

  return (
    <section aria-labelledby="startup-heading">
      <h2 id="startup-heading" style={{ fontSize: 15 }}>
        Startup
      </h2>
      <label>
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null}
          onChange={(event) => void change(event.target.checked)}
        />{" "}
        Launch at sign-in
      </label>
      <p className="muted" style={{ margin: "4px 0" }}>
        Starts in the system tray when you sign in to Windows, so the capture hotkey always works.
      </p>
      {problem && <p role="alert">{problem}</p>}
    </section>
  );
}
