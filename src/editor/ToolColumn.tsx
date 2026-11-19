import { type Bindings, keyLabel } from "../shared/shortcutRegistry";
import { formatCombo } from "../settings/hotkey";
import { ToolIcon } from "./toolIcons";
import type { Tool } from "./tools";

interface Props {
  tools: readonly Tool[];
  active: string;
  disabled: boolean;
  bindings: Bindings;
  onPick(tool: string): void;
  /** The global pointer highlight's toggle at the bottom (not a tool): pressed while on; the tooltip names its hotkey. */
  pointer?: { on: boolean; hotkey: string | null; onToggle(): void };
}

/** The tool column (left): each tool's icon, name and shortcut key. */
export function ToolColumn({
  tools,
  active,
  disabled,
  bindings,
  onPick,
  pointer,
}: Props) {
  return (
    <nav className="tools" aria-label="Tools">
      {tools.map((tool) => {
        const name = `${tool.label} (${keyLabel(tool.shortcutAction, bindings)})`;
        return (
          <button
            key={tool.id}
            type="button"
            className="tool"
            aria-pressed={tool.id === active}
            aria-label={name}
            title={name}
            disabled={disabled}
            onClick={() => onPick(tool.id)}
          >
            <ToolIcon id={tool.id} />
            <span className="tool-label">{tool.label}</span>
            <kbd>{keyLabel(tool.shortcutAction, bindings)}</kbd>
          </button>
        );
      })}
      {pointer ? (
        <button
          type="button"
          className="pointer-toggle"
          aria-pressed={pointer.on}
          aria-label="Pointer highlight"
          title={
            pointer.hotkey
              ? `Pointer highlight (${formatCombo(pointer.hotkey)})`
              : "Pointer highlight"
          }
          onClick={pointer.onToggle}
        >
          <span className="tool-icon" aria-hidden="true">
            ●
          </span>
          <span className="tool-label">Pointer</span>
          {pointer.hotkey ? <kbd>{formatCombo(pointer.hotkey)}</kbd> : null}
        </button>
      ) : null}
    </nav>
  );
}
