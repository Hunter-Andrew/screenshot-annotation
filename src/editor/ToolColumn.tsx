import { type Bindings, keyLabel } from "./shortcuts";
import type { Tool } from "./tools";

interface Props {
  tools: readonly Tool[];
  active: string;
  disabled: boolean;
  bindings: Bindings;
  onPick(tool: string): void;
}

/** The tool column (left): each tool's name and its shortcut key. */
export function ToolColumn({ tools, active, disabled, bindings, onPick }: Props) {
  return (
    <nav className="tools" aria-label="Tools">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="tool"
          aria-pressed={tool.id === active}
          disabled={disabled}
          onClick={() => onPick(tool.id)}
        >
          <span>{tool.label}</span>
          <kbd>{keyLabel(tool.shortcutAction, bindings)}</kbd>
        </button>
      ))}
    </nav>
  );
}
