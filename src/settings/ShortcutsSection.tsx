import type { PlatformBridge } from "../platform/bridge";
import { defaultBindings, keyLabel, shortcutsIn, type ShortcutContext } from "../shared/shortcutRegistry";
import { HotkeyRecorder } from "./HotkeyRecorder";

const GROUPS: { context: ShortcutContext; name: string }[] = [
  { context: "overlay", name: "Capture overlay" },
  { context: "editor", name: "Editor" },
];

const ROW_STYLE = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: 8,
  padding: "2px 0",
  overflowWrap: "anywhere",
} as const;

/** Every shortcut from the registry with its current binding (read-only for now; remapping is ticket 47). */
export function ShortcutsSection({ bridge }: { bridge: PlatformBridge }) {
  return (
    <section aria-labelledby="shortcuts-heading">
      <h2 id="shortcuts-heading" style={{ fontSize: 15 }}>
        Shortcuts
      </h2>
      <div role="group" aria-label="Capture">
        <h3 style={{ fontSize: 13 }}>Capture</h3>
        <HotkeyRecorder bridge={bridge} />
      </div>
      {GROUPS.map(({ context, name }) => {
        const bindings = defaultBindings(context);
        return (
          <div key={context} role="group" aria-label={name}>
            <h3 style={{ fontSize: 13 }}>{name}</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {shortcutsIn(context).map((action) => (
                <li key={action.id} aria-label={action.label} style={ROW_STYLE}>
                  <span>{action.label}</span>
                  <span>
                    <kbd>{keyLabel(action.id, bindings)}</kbd>
                    {!action.remappable && <span style={{ marginLeft: 8, opacity: 0.7 }}>Fixed</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
