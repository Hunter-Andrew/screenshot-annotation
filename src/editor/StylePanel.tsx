import type { AnnotationKind } from "../core/annotations";
import type { GroupId, PropertyGroups, Style } from "../core/propertyGroups";
import { GROUP_EDITORS, type GroupEditor } from "./style/groups";

/** What the Arrange section does to the selected Annotation (ticket 13). */
export interface Arrange {
  canForward: boolean;
  canBack: boolean;
  onForward(): void;
  onBack(): void;
  onDelete(): void;
  /** Tooltips, with the shortcut keys. */
  titles: { forward: string; back: string; delete: string };
}

interface Props {
  /** The kind being styled: the selected Annotation's, or the active drawing tool's. Null: nothing to style. */
  kind: AnnotationKind | null;
  /** Current values: the selected Annotation's, or the tool's default style. */
  style: Style;
  onChange<K extends GroupId>(group: K, value: PropertyGroups[K]): void;
  /** Stacking order and Delete for the selected Annotation; null when nothing is selected (or read-only). */
  arrange?: Arrange | null;
  /** The active drawing tool's own behavior option (not a property of any Annotation); null when no drawing tool is active. */
  toolOption?: { label: string; checked: boolean; onChange(value: boolean): void; hidden?: boolean } | null;
}

/** The Style panel (right column): one section per property group the kind opts into. */
export function StylePanel({ kind, style, onChange, arrange = null, toolOption = null }: Props) {
  return (
    <aside className="style-panel" aria-label="Style">
      <h2>Style</h2>
      {toolOption &&
        (toolOption.hidden ? (
          // Same height, invisible: when a drawing tool's box is committed by clicking a control below, the tool
          // goes back to Select mid-click, and the panel must not shift under the pointer.
          <div className="tool-option placeholder" aria-hidden="true">
            <input type="checkbox" disabled tabIndex={-1} />
            {toolOption.label}
          </div>
        ) : (
          <label className="tool-option">
            <input type="checkbox" checked={toolOption.checked} onChange={(e) => toolOption.onChange(e.target.checked)} />
            {toolOption.label}
          </label>
        ))}
      {kind === null ? (
        <p className="hint">Select an Annotation, or pick a tool, to change its style.</p>
      ) : (
        kind.groups.map((group) => {
          const value = style[group];
          if (!value) return null;
          const editor = GROUP_EDITORS[group] as GroupEditor<typeof group>;
          return (
            <section key={group} className="group" aria-label={editor.title}>
              <h3>{editor.title}</h3>
              <editor.Editor value={value} onChange={(next) => onChange(group, next)} />
            </section>
          );
        })
      )}
      {arrange && (
        <section className="group" aria-label="Arrange">
          <h3>Arrange</h3>
          <div className="presets">
            <button onClick={arrange.onForward} disabled={!arrange.canForward} title={arrange.titles.forward}>
              Bring forward
            </button>
            <button onClick={arrange.onBack} disabled={!arrange.canBack} title={arrange.titles.back}>
              Send back
            </button>
          </div>
          <div className="presets arrange-delete">
            <button onClick={arrange.onDelete} title={arrange.titles.delete}>
              Delete
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}
