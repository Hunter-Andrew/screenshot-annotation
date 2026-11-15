import { useEffect, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";
import { formatCombo } from "./hotkey";
import { shouldShowPrintScreenNotice } from "./noticeRule";

/**
 * One-time notice: Print Screen still opens Snipping Tool. The user flips the Windows toggle
 * themselves (via the deep link); the app never writes that setting.
 */
export function PrintScreenNotice({ bridge }: { bridge: PlatformBridge }) {
  const [visible, setVisible] = useState(false);
  const [keepLabel, setKeepLabel] = useState("Ctrl+Shift+S");

  useEffect(() => {
    void Promise.all([bridge.getPrintScreenNotice(), bridge.getHotkey()]).then(([notice, hotkey]) => {
      setKeepLabel(formatCombo(hotkey.accelerator));
      setVisible(shouldShowPrintScreenNotice(notice));
    });
  }, [bridge]);

  if (!visible) return null;
  const answer = (open: boolean) => async () => {
    if (open) await bridge.openKeyboardAccessibilitySettings();
    await bridge.dismissPrintScreenNotice();
    setVisible(false);
  };
  return (
    <section aria-labelledby="ps-heading" style={{ border: "1px solid #888", padding: 8, margin: "8px 0" }}>
      <h2 id="ps-heading" style={{ fontSize: 15 }}>
        Print Screen
      </h2>
      <p>
        Print Screen opens Snipping Tool. Use it for Screenshot Annotation instead? Open the Windows setting,
        turn off &ldquo;Use the Print screen button to open screen capturing&rdquo;, then record Print Screen as
        the capture hotkey above.
      </p>
      <button type="button" onClick={answer(true)}>
        Open Windows setting
      </button>{" "}
      <button type="button" onClick={answer(false)}>
        Keep {keepLabel}
      </button>
    </section>
  );
}
