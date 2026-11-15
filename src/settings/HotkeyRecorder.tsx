import { useCallback, useEffect, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";
import { comboFromKeyEvent, formatCombo, isBarePrintScreen } from "./hotkey";
import { shouldWarnPrintScreenTaken } from "./noticeRule";

type Problem =
  | { accelerator: string; reason: "conflict" | "failed" | "raw-input" }
  | "needs-modifier"
  | "unsupported-key"
  | "lost-focus"
  | null;

/** The capture-hotkey field: click it, press a combination, and the backend re-registers it. */
export function HotkeyRecorder({ bridge }: { bridge: PlatformBridge }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  // Whether Windows still gives Print Screen to Snipping Tool. Re-read live (never cached across
  // focus changes) because the user flips it in Windows Settings while this window stays open.
  const [snippingEnabled, setSnippingEnabled] = useState(false);

  const refreshSnipping = useCallback(() => {
    void bridge
      .getPrintScreenNotice()
      .then((notice) => setSnippingEnabled(notice.snippingEnabled))
      .catch(() => {
        // Unreadable: show nothing rather than a warning we cannot back up.
      });
  }, [bridge]);

  useEffect(() => {
    void bridge.getHotkey().then((state) => {
      setCurrent(state.accelerator);
      if (!state.registered) setProblem(unregisteredProblem(state));
    });
    refreshSnipping();
  }, [bridge, refreshSnipping]);

  useEffect(() => {
    window.addEventListener("focus", refreshSnipping);
    return () => window.removeEventListener("focus", refreshSnipping);
  }, [refreshSnipping]);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      // Browsers only report Print Screen on keyup, and many apps swallow its keydown.
      if (e.type === "keyup" && e.code !== "PrintScreen") return;
      void bridge.logSettings(
        `hotkey recorder: ${e.type} code=${e.code} ctrl=${e.ctrlKey} alt=${e.altKey} shift=${e.shiftKey} meta=${e.metaKey}`,
      );
      e.preventDefault();
      const result = comboFromKeyEvent(e);
      if (result.kind === "pending") return;
      setRecording(false);
      if (result.kind === "cancel") {
        void bridge.logSettings("hotkey recorder: cancelled with Esc");
        return;
      }
      if (result.kind === "invalid") {
        void bridge.logSettings(`hotkey recorder: rejected (${result.reason})`);
        setProblem(result.reason);
        return;
      }
      const { accelerator } = result;
      void bridge.setHotkey(accelerator).then((saved) => {
        void bridge.logSettings(`hotkey recorder: set_hotkey ${accelerator}: ${saved.ok ? "ok" : saved.reason}`);
        if (saved.ok) {
          setCurrent(accelerator);
          setProblem(null);
          refreshSnipping();
          // The backend may have fallen back from Raw Input; show that like any other hotkey problem.
          void bridge.getHotkey().then((state) => {
            if (!state.registered) setProblem(unregisteredProblem(state));
          });
        } else {
          setProblem({ accelerator, reason: saved.reason === "conflict" ? "conflict" : "failed" });
        }
      });
    };
    void bridge.logSettings("hotkey recorder: recording started");
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [recording, bridge, refreshSnipping]);

  const onBlur = () => {
    if (!recording) return;
    setRecording(false);
    // Focus moving inside the page just cancels. The whole window losing focus mid-recording is
    // what happens when another program (Snipping Tool, for Print Screen) takes the key.
    if (!document.hasFocus()) {
      void bridge.logSettings("hotkey recorder: window lost focus while recording; no key was recorded");
      setProblem("lost-focus");
    }
  };

  const warn = shouldWarnPrintScreenTaken(current, snippingEnabled);

  return (
    <section aria-labelledby="hotkey-heading">
      <h2 id="hotkey-heading" style={{ fontSize: 15 }}>
        Capture hotkey
      </h2>
      <button
        type="button"
        onClick={() => {
          setProblem(null);
          setRecording(true);
        }}
        onBlur={onBlur}
      >
        {recording ? "Press a key combination… (Esc to cancel)" : current === null ? "…" : formatCombo(current)}
      </button>
      {problem !== null && (
        <p role="alert" style={{ color: "#b00020" }}>
          {describe(problem)}
        </p>
      )}
      {current !== null && isBarePrintScreen(current) && (
        <p style={{ margin: "8px 0" }}>
          Windows still copies the whole screen to the clipboard when you press Print Screen; the region you capture
          replaces that copy.
        </p>
      )}
      {warn && (
        <div role="status" style={{ border: "1px solid #b26a00", padding: 8, margin: "8px 0" }}>
          <p style={{ margin: "0 0 8px" }}>
            Windows will keep sending Print Screen to Snipping Tool, so Snipping Tool opens as well as the capture
            overlay, until you turn off &ldquo;Use the Print screen button to open screen capturing&rdquo; in
            Windows Settings. This warning goes away by itself once that is off.
          </p>
          <button type="button" onClick={() => void bridge.openKeyboardAccessibilitySettings()}>
            Open Windows setting
          </button>
        </div>
      )}
    </section>
  );
}

function unregisteredProblem(state: { accelerator: string; rawInputFailed?: boolean }): NonNullable<Problem> {
  return { accelerator: state.accelerator, reason: state.rawInputFailed ? "raw-input" : "conflict" };
}

function describe(problem: NonNullable<Problem>): string {
  if (problem === "needs-modifier") return "Hold Ctrl, Alt, Shift or Win together with the key.";
  if (problem === "unsupported-key") return "That key cannot be used as a hotkey.";
  if (problem === "lost-focus")
    return (
      "This window lost focus while waiting for a key. If you pressed Print Screen, Windows probably sent it to " +
      "Snipping Tool: turn off \u201cUse the Print screen button to open screen capturing\u201d in Windows Settings > " +
      "Accessibility > Keyboard first, then try again."
    );
  const name = formatCombo(problem.accelerator);
  if (problem.reason === "raw-input")
    return (
      `The app could not watch the Print Screen key directly, and fell back to the standard hotkey registration, which ` +
      `Windows may never deliver for Print Screen. Details are in capture.log (tray menu: Open log folder). ` +
      `Another hotkey such as Ctrl+Print Screen works.`
    );
  return problem.reason === "conflict"
    ? `${name} is already in use by another app. The previous hotkey stays in force; pick a different combination.`
    : `Could not save ${name}. The previous hotkey stays in force.`;
}
