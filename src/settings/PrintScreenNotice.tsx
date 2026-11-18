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
    if (open) await bridge.openKeyboardSettings();
    await bridge.dismissPrintScreenNotice();
    setVisible(false);
  };
  return (
    <section aria-labelledby="ps-heading" className="notice">
      <h2 id="ps-heading" style={{ fontSize: 15 }}>
        Print Screen
      </h2>
      <p>
        Print Screen opens Snipping Tool. Use it for Screenshot Annotation instead? Open the Windows setting,
        turn off &ldquo;Use the Print screen button to open screen capturing&rdquo; (Settings &gt; Bluetooth &amp;
        devices &gt; Keyboard), then record Print Screen as the capture hotkey above.
      </p>
      <p>
        &ldquo;Open Windows setting&rdquo; opens Windows Settings at Bluetooth &amp; devices: click Keyboard, then
        &ldquo;Use the Print screen button to open screen capturing&rdquo; (Bluetooth &amp; devices &gt; Keyboard &gt;
        Use the Print screen button to open screen capturing). On some Windows builds it is under Accessibility &gt;
        Keyboard instead. The app never changes that setting itself. Either button closes this notice for good: it only appears once. If Print
        Screen is your hotkey while Windows still owns the key, a warning stays under the hotkey field until the
        setting is off.
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
