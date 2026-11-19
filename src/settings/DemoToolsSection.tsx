import { useEffect, useState } from "react";
import type { DemoAction, PlatformBridge, SetDemoHotkeyResult } from "../platform/bridge";
import { comboFromKeyEvent, formatCombo } from "./hotkey";
import { DrawingHighlighterSetting } from "./DrawingHighlighterSetting";
import { LaserPointerSettings } from "./LaserPointerSettings";

const ROWS: { action: DemoAction; label: string; other: string }[] = [
  { action: "laserPointer", label: "Laser pointer", other: "Drawing mode" },
  { action: "drawingMode", label: "Drawing mode", other: "Laser pointer" },
];

type Problem =
  | { kind: "refused"; reason: Extract<SetDemoHotkeyResult, { ok: false }>["reason"]; accelerator: string }
  | { kind: "key"; reason: "needs-modifier" | "unsupported-key" };

/** Settings > Demo tools: the options of the two tools (their hotkeys are on the keyboard shortcuts screen). */
export function DemoToolsSection({ bridge }: { bridge: PlatformBridge }) {
  return (
    <section aria-labelledby="demo-tools-heading">
      <h2 id="demo-tools-heading" style={{ fontSize: 15 }}>
        Demo tools
      </h2>
      <LaserPointerSettings bridge={bridge} />
      <DrawingHighlighterSetting bridge={bridge} />
    </section>
  );
}

/** The keyboard shortcuts screen: one hotkey recorder each for the laser pointer and drawing mode (ticket 49). */
export function DemoHotkeys({ bridge }: { bridge: PlatformBridge }) {
  const [hotkeys, setHotkeys] = useState<Record<DemoAction, string> | null>(null);
  const [unregistered, setUnregistered] = useState<Record<DemoAction, boolean>>({
    laserPointer: false,
    drawingMode: false,
  });
  const [recording, setRecording] = useState<DemoAction | null>(null);
  const [problems, setProblems] = useState<Partial<Record<DemoAction, Problem>>>({});

  useEffect(() => {
    void bridge.getDemoHotkeys().then((state) => {
      setHotkeys({ laserPointer: state.laserPointer, drawingMode: state.drawingMode });
      setUnregistered({
        laserPointer: !state.laserPointerRegistered,
        drawingMode: !state.drawingModeRegistered,
      });
    });
  }, [bridge]);

  useEffect(() => {
    if (recording === null) return;
    const action = recording;
    const onKey = (e: KeyboardEvent) => {
      // Browsers only report Print Screen on keyup.
      if (e.type === "keyup" && e.code !== "PrintScreen") return;
      e.preventDefault();
      const result = comboFromKeyEvent(e);
      if (result.kind === "pending") return;
      setRecording(null);
      if (result.kind === "cancel") return;
      if (result.kind === "invalid") {
        setProblems((p) => ({ ...p, [action]: { kind: "key", reason: result.reason } }));
        return;
      }
      const { accelerator } = result;
      void bridge.setDemoHotkey(action, accelerator).then((saved) => {
        void bridge.logSettings(`demo hotkey recorder: ${action} ${accelerator}: ${saved.ok ? "ok" : saved.reason}`);
        if (saved.ok) {
          setHotkeys((h) => (h === null ? h : { ...h, [action]: accelerator }));
          setUnregistered((u) => ({ ...u, [action]: false }));
          setProblems((p) => ({ ...p, [action]: undefined }));
        } else {
          setProblems((p) => ({ ...p, [action]: { kind: "refused", reason: saved.reason, accelerator } }));
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
    <div role="group" aria-label="Demo tools">
      <h3 style={{ fontSize: 13 }}>Demo tools</h3>
      {ROWS.map(({ action, label, other }) => {
        const current = hotkeys?.[action] ?? null;
        const problem = problems[action];
        const shown = recording === action ? "Press a key combination… (Esc to cancel)" : current === null ? "…" : formatCombo(current);
        const dead = unregistered[action] && problem === undefined && current !== null;
        return (
          <div key={action}>
            <h4 style={{ fontSize: 13, margin: "8px 0 4px" }}>{label}</h4>
            <button
              type="button"
              aria-label={`${label} hotkey: ${shown}`}
              onClick={() => {
                setProblems((p) => ({ ...p, [action]: undefined }));
                setRecording(action);
              }}
              onBlur={() => setRecording((r) => (r === action ? null : r))}
            >
              {shown}
            </button>
            {problem !== undefined && (
              <p role="alert" className="error">
                {describe(problem, other)}
              </p>
            )}
            {dead && (
              <p role="alert" className="error">
                {formatCombo(current)} is already in use by another app, so this hotkey does nothing. Pick a different combination.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function describe(problem: Problem, other: string): string {
  if (problem.kind === "key") {
    return problem.reason === "needs-modifier"
      ? "Hold Ctrl, Alt, Shift or Win together with the key."
      : "That key cannot be used as a hotkey.";
  }
  const name = formatCombo(problem.accelerator);
  switch (problem.reason) {
    case "print-screen":
      return "Print Screen is the capture key and cannot be used for a demo tool. Pick a different combination.";
    case "capture-hotkey":
      return `${name} is the capture hotkey. Pick a different combination.`;
    case "other-demo":
      return `${name} is already the ${other} hotkey. Pick a different combination.`;
    case "conflict":
      return `${name} is already in use by another app. The previous hotkey stays in force; pick a different combination.`;
    default:
      return `Could not save ${name}. The previous hotkey stays in force.`;
  }
}
