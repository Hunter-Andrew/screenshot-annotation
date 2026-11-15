import type { AnnotationKind } from "../core/annotations";
import type { GroupId, PropertyGroups, Style } from "../core/propertyGroups";
import { GROUP_EDITORS, type GroupEditor } from "./style/groups";

interface Props {
  /** The kind being styled: the selected Annotation's, or the active drawing tool's. Null: nothing to style. */
  kind: AnnotationKind | null;
  /** Current values: the selected Annotation's, or the tool's default style. */
  style: Style;
  onChange<K extends GroupId>(group: K, value: PropertyGroups[K]): void;
}

/** The Style panel (right column): one section per property group the kind opts into. */
export function StylePanel({ kind, style, onChange }: Props) {
  return (
    <aside className="style-panel" aria-label="Style">
      <h2>Style</h2>
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
    </aside>
  );
}
