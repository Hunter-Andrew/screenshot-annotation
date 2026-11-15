import { useEffect, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";
import { comboFromKeyEvent, formatCombo } from "./hotkey";

type Problem = { accelerator: string; reason: "conflict" | "failed" } | "needs-modifier" | "unsupported-key" | null;

/** The capture-hotkey field: click it, press a combination, and the backend re-registers it. */
export function HotkeyRecorder({ bridge }: { bridge: PlatformBridge }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  useEffect(() => {
    void bridge.getHotkey().then((state) => {
      setCurrent(state.accelerator);
      if (!state.registered) setProblem({ accelerator: state.accelerator, reason: "conflict" });
    });
  }, [bridge]);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      // Browsers only report Print Screen on keyup, and many apps swallow its keydown.
      if (e.type === "keyup" && e.code !== "PrintScreen") return;
      e.preventDefault();
      const result = comboFromKeyEvent(e);
      if (result.kind === "pending") return;
      setRecording(false);
      if (result.kind === "cancel") return;
      if (result.kind === "invalid") {
        setProblem(result.reason);
        return;
      }
      const { accelerator } = result;
      void bridge.setHotkey(accelerator).then((saved) => {
        if (saved.ok) {
          setCurrent(accelerator);
          setProblem(null);
        } else {
          setProblem({ accelerator, reason: saved.reason === "conflict" ? "conflict" : "failed" });
        }
      });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [recording, bridge]);

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
        onBlur={() => setRecording(false)}
      >
        {recording ? "Press a key combination… (Esc to cancel)" : current === null ? "…" : formatCombo(current)}
      </button>
      {problem !== null && (
        <p role="alert" style={{ color: "#b00020" }}>
          {describe(problem)}
        </p>
      )}
    </section>
  );
}

function describe(problem: NonNullable<Problem>): string {
  if (problem === "needs-modifier") return "Hold Ctrl, Alt, Shift or Win together with the key.";
  if (problem === "unsupported-key") return "That key cannot be used as a hotkey.";
  const name = formatCombo(problem.accelerator);
  return problem.reason === "conflict"
    ? `${name} is already in use by another app. The previous hotkey stays in force; pick a different combination.`
    : `Could not save ${name}. The previous hotkey stays in force.`;
}
