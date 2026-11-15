import { type Bindings, keyLabel } from "./shortcuts";
import { ToolIcon } from "./toolIcons";
import type { Tool } from "./tools";

interface Props {
  tools: readonly Tool[];
  active: string;
  disabled: boolean;
  bindings: Bindings;
  onPick(tool: string): void;
}

/** The tool column (left): each tool's icon, name and shortcut key. */
export function ToolColumn({ tools, active, disabled, bindings, onPick }: Props) {
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
    </nav>
  );
}
