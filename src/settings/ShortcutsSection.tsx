import { type ReactNode, useCallback, useState } from "react";
import type { PlatformBridge } from "../platform/bridge";
import { reservedKeysWithoutAction, resolveBindings, validateBinding, validateReset } from "../shared/shortcutBindings";
import { CONTEXT_NAME, formatKeySpec, keyLabel, SHORTCUT_CONTEXTS, shortcutsIn } from "../shared/shortcutRegistry";
import { useShortcutOverrides } from "../shared/useShortcutBindings";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { ShortcutRecorder } from "./ShortcutRecorder";

const ROW_STYLE = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: 8,
  padding: "2px 0",
  overflowWrap: "anywhere",
} as const;

/**
 * Every shortcut from the registry with its current binding. Remappable rows have the shared recorder
 * and a Reset; overrides are saved to settings.json at once (ticket 47). A refused key never changes
 * anything: the row says why, naming the clashing action.
 */
export function ShortcutsSection({ bridge, extra }: { bridge: PlatformBridge; extra?: ReactNode }) {
  const [overrides, setOverrides] = useShortcutOverrides(bridge, (message) => void bridge.logSettings(message));
  const [recording, setRecording] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null);

  const save = useCallback(
    (next: Record<string, string>) => {
      setOverrides(next);
      bridge.setShortcutOverrides(next).catch((e) => void bridge.logSettings(`setShortcutOverrides failed: ${e}`));
    },
    [bridge, setOverrides],
  );

  const record = (id: string, spec: string) => {
    const check = validateBinding(id, spec, overrides);
    if (!check.ok) return setProblem({ id, message: check.message });
    setProblem(null);
    save({ ...overrides, [id]: spec });
  };

  const reset = (id: string) => {
    const check = validateReset(id, overrides);
    if (!check.ok) return setProblem({ id, message: check.message });
    setProblem(null);
    const { [id]: _removed, ...rest } = overrides;
    void _removed;
    save(rest);
  };

  return (
    <section aria-labelledby="shortcuts-heading">
      <h2 id="shortcuts-heading" style={{ fontSize: 15 }}>
        Shortcuts
      </h2>
      <div role="group" aria-label="Capture">
        <h3 style={{ fontSize: 13 }}>Capture</h3>
        <HotkeyRecorder bridge={bridge} />
      </div>
      {extra}
      {SHORTCUT_CONTEXTS.map((context) => {
        const name = CONTEXT_NAME[context];
        const bindings = resolveBindings(context, overrides);
        return (
          <div key={context} role="group" aria-label={name}>
            <h3 style={{ fontSize: 13 }}>{name}</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {shortcutsIn(context).map((action) => (
                <li key={action.id} aria-label={action.label} style={ROW_STYLE}>
                  <span>{action.label}</span>
                  {action.remappable ? (
                    <span>
                      <ShortcutRecorder
                        label={`Change shortcut for ${action.label}`}
                        recording={recording === action.id}
                        onStart={() => {
                          setProblem(null);
                          setRecording(action.id);
                        }}
                        onStop={() => setRecording((r) => (r === action.id ? null : r))}
                        onRecord={(spec) => record(action.id, spec)}
                        onRefuse={(message) => setProblem({ id: action.id, message })}
                      >
                        {keyLabel(action.id, bindings)}
                      </ShortcutRecorder>
                      {overrides[action.id] !== undefined && (
                        <button type="button" aria-label={`Reset ${action.label}`} style={{ marginLeft: 8 }} onClick={() => reset(action.id)}>
                          Reset
                        </button>
                      )}
                    </span>
                  ) : (
                    <span>
                      <kbd>{keyLabel(action.id, bindings)}</kbd>
                      <span style={{ marginLeft: 8, opacity: 0.7 }}>Fixed</span>
                    </span>
                  )}
                  {problem?.id === action.id && (
                    <p role="alert" className="error" style={{ flexBasis: "100%", margin: "2px 0" }}>
                      {problem.message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {context === "editor" && (
              // The rest of the fixed keys (ticket 28 decision 8): they have no action of their own, so no row above.
              // Laid out like the rows above: what it does on the left, the key and "Fixed" on the right.
              <ul aria-label="Other fixed keys" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {reservedKeysWithoutAction().map(({ spec, label }) => (
                  <li key={spec} aria-label={label} style={ROW_STYLE}>
                    <span>{label}</span>
                    <span>
                      <kbd>{formatKeySpec(spec)}</kbd>
                      <span style={{ marginLeft: 8, opacity: 0.7 }}>Fixed</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <p>
        <button
          type="button"
          aria-label="Reset all shortcuts"
          disabled={Object.keys(overrides).length === 0}
          onClick={() => {
            setProblem(null);
            save({});
          }}
        >
          Reset all
        </button>
      </p>
    </section>
  );
}
