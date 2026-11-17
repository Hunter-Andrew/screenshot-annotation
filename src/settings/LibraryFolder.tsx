import { useEffect, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";

/** Where captures are saved: shown read-only (it is not a setting) with a button to open it in Explorer. */
export function LibraryFolder({ bridge }: { bridge: PlatformBridge }) {
  const [folder, setFolder] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    bridge.getLibraryFolder().then(
      (value) => alive && setFolder(value),
      (e) => void bridge.logSettings(`getLibraryFolder failed: ${e}`),
    );
    return () => {
      alive = false;
    };
  }, [bridge]);

  return (
    <section aria-labelledby="library-heading">
      <h2 id="library-heading" style={{ fontSize: 15 }}>
        Library
      </h2>
      <label>
        Library folder
        <input type="text" readOnly value={folder} style={{ display: "block", width: "100%", boxSizing: "border-box" }} />
      </label>
      <button
        type="button"
        style={{ marginTop: 6 }}
        onClick={() =>
          bridge.openLibraryFolder().then(
            () => setProblem(null),
            (e) => setProblem(`Could not open the folder: ${e instanceof Error ? e.message : String(e)}`),
          )
        }
      >
        Open in Explorer
      </button>
      {problem && <p role="alert">{problem}</p>}
    </section>
  );
}
