import { useEffect, useRef } from "react";
import { MODIFIER_ALONE_REFUSAL, specFromKeyEvent } from "../shared/shortcutBindings";

/**
 * The shared key recorder of the shortcut rows (ticket 28 decision 4): a button that shows the
 * current key; click it and press the new key or combination. Esc cancels. It only reports what was
 * pressed (`onRecord`) or why it was refused (`onRefuse`); the caller applies the binding rules.
 */
export function ShortcutRecorder({
  label,
  recording,
  onStart,
  onStop,
  onRecord,
  onRefuse,
  children,
}: {
  /** Accessible name, e.g. "Change shortcut for Arrow". */
  label: string;
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
  onRecord: (spec: string) => void;
  onRefuse: (message: string) => void;
  /** The current key, shown on the button. */
  children: string;
}) {
  const handlers = useRef({ onStop, onRecord, onRefuse });
  handlers.current = { onStop, onRecord, onRefuse };

  useEffect(() => {
    if (!recording) return;
    let sawKey = false;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const result = specFromKeyEvent(e);
      if (result.kind === "pending") return;
      sawKey = true;
      handlers.current.onStop();
      if (result.kind === "spec") handlers.current.onRecord(result.spec);
      else if (result.kind === "refused") handlers.current.onRefuse(result.message);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Browsers only report Print Screen on keyup.
      if (e.key === "PrintScreen") {
        e.preventDefault();
        sawKey = true;
        handlers.current.onStop();
        handlers.current.onRefuse(specFromKeyEvent(e).kind === "refused" ? (specFromKeyEvent(e) as { message: string }).message : "");
        return;
      }
      // A modifier pressed and released alone: say why nothing was recorded.
      if (!sawKey && specFromKeyEvent(e).kind === "pending") {
        handlers.current.onStop();
        handlers.current.onRefuse(MODIFIER_ALONE_REFUSAL);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [recording]);

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => (recording ? onStop() : onStart())}
      onBlur={() => recording && onStop()}
    >
      {recording ? "Press a key… (Esc to cancel)" : children}
    </button>
  );
}
