import { useState } from "react";
import type { PlatformBridge } from "../platform/bridge";

/**
 * "Reset tool styles": every tool forgets its last color, thickness, fill and "return to Select"
 * choice and starts from its default again. Shapes already drawn keep their own style.
 */
export function ResetToolStyles({ bridge }: { bridge: PlatformBridge }) {
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);

  const reset = async () => {
    try {
      await bridge.resetToolStyles();
      setMessage({ text: "Tool styles reset.", failed: false });
    } catch (e) {
      setMessage({ text: `Could not reset tool styles: ${e instanceof Error ? e.message : String(e)}`, failed: true });
    }
  };

  return (
    <section aria-labelledby="styles-heading">
      <h2 id="styles-heading" style={{ fontSize: 15 }}>
        Tool styles
      </h2>
      <p style={{ margin: "4px 0" }}>Each tool remembers the style you last used. Reset them to the defaults:</p>
      <button type="button" onClick={() => void reset()}>
        Reset tool styles
      </button>
      {message && <p role={message.failed ? "alert" : "status"}>{message.text}</p>}
    </section>
  );
}
