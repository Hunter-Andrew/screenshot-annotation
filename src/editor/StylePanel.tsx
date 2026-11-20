import type { Background } from "../core/annotation";
import type { AnnotationKind } from "../core/annotations";
import { BACKGROUND_LABELS, BACKGROUNDS } from "../core/area";
import type { GroupId, PropertyGroups, Style } from "../core/propertyGroups";
import type { RunFont, SelectionFont } from "../core/annotations/runs";
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

/**
 * A Text or Callout is being typed in. Its Font section then keeps the edit going when it takes the focus, and with
 * characters selected (`selection` set) changes those characters only.
 */
export interface TextEditing {
  /** What the selected characters look like; null with a caret only. */
  selection: { font: SelectionFont } | null;
  /** Style the selected characters only. */
  onStyle(patch: RunFont): void;
  /** Put the keyboard back into the text, keeping the selection (after a button or a preset changed something). */
  focusText(): void;
}

interface Props {
  /** How many Annotations are selected: with several there is no style to show, only what can be done with them. */
  selectedCount?: number;
  /** The kind being styled: the selected Annotation's, or the active drawing tool's. Null: nothing to style. */
  kind: AnnotationKind | null;
  /** Current values: the selected Annotation's, or the tool's default style. */
  style: Style;
  onChange<K extends GroupId>(group: K, value: PropertyGroups[K]): void;
  /** Groups of the active TOOL only (the Pen's Mode), shown above the kind's own groups; never passed for a selected Annotation. */
  toolGroups?: readonly GroupId[];
  /** Stacking order and Delete for the selected Annotation; null when nothing is selected (or read-only). */
  arrange?: Arrange | null;
  /** The active drawing tool's own behavior option (not a property of any Annotation); null when no drawing tool is active. */
  /** The Crop section: shown while the Crop tool is active or the image has a crop. Null: not shown. */
  crop?: { active: boolean; hasCrop: boolean; onRemove(): void } | null;
  toolOption?: { label: string; checked: boolean; onChange(value: boolean): void; hidden?: boolean } | null;
  /** The Image section (ticket 37 and M4 polish B): the background outside the Capture, and whether the editor shows what is outside the canvas. Null: not shown. */
  textEditing?: TextEditing | null;
  image?: { background: Background; onChange(background: Background): void; showOutside: boolean; onShowOutside(show: boolean): void } | null;
}

/** The Style panel (right column): one section per property group the kind opts into. */
export function StylePanel({ selectedCount = 0, kind, style, onChange, toolGroups = [], arrange = null, crop = null, toolOption = null, image = null, textEditing = null }: Props) {
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
      {crop && (
        <section className="group" aria-label="Crop">
          <h3>Crop</h3>
          {crop.active && <p className="hint">Drag a handle, or drag a new rectangle, to set the visible area. Going past the edge makes the image bigger.</p>}
          <div className="presets">
            <button onClick={crop.onRemove} disabled={!crop.hasCrop}>
              Remove crop
            </button>
          </div>
        </section>
      )}
      {image && (
        <section className="group" aria-label="Image">
          <h3>Image</h3>
          <div role="radiogroup" aria-label="Background" className="presets">
            {BACKGROUNDS.map((value) => (
              <label key={value} className="radio">
                <input
                  type="radio"
                  name="image-background"
                  checked={image.background === value}
                  onChange={() => image.onChange(value)}
                />
                {BACKGROUND_LABELS[value]}
              </label>
            ))}
          </div>
          <label className="tool-option">
            <input type="checkbox" checked={image.showOutside} onChange={(e) => image.onShowOutside(e.target.checked)} />
            Show outside the canvas
          </label>
        </section>
      )}
      {kind === null ? (
        crop?.active ? null : (
          <p className="hint">
            {selectedCount > 1
              ? `${selectedCount} Annotations selected. Drag one to move them all, or press Delete to remove them.`
              : "Select an Annotation, or pick a tool, to change its style."}
          </p>
        )
      ) : (
        [...toolGroups, ...kind.groups].map((group) => {
          const value = style[group];
          if (!value) return null;
          const editor = GROUP_EDITORS[group] as GroupEditor<typeof group>;
          // The Font section of a Text or Callout: using it must not end the text edit or lose the selection.
          const keepsEditing = group === "font" && kind.typedInPlace === true;
          const typing = keepsEditing ? textEditing : null;
          return (
            <section
              key={group}
              className="group"
              aria-label={editor.title}
              {...(keepsEditing ? { "data-keeps-text-editing": "" } : {})}
              // A press on anything of the section but a field that takes the keyboard (a button, a label, the gap between
              // controls) must not move the focus off the text: that would end the edit and drop the selection.
              onMouseDown={typing ? (e) => !(e.target as Element).closest("input, select, textarea") && e.preventDefault() : undefined}
              onClick={typing ? (e) => (e.target as Element).closest("button") && typing.focusText() : undefined}
              onChange={typing ? (e) => ((e.target as Element).tagName === "SELECT" || (e.target as HTMLInputElement).type === "color") && typing.focusText() : undefined}
            >
              <h3>{editor.title}</h3>
              <editor.Editor
                value={value}
                thicknessPresets={kind.thicknessPresets}
                onChange={(next) => onChange(group, next)}
                selection={typing?.selection ? { font: typing.selection.font, onStyle: typing.onStyle } : null}
              />
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
