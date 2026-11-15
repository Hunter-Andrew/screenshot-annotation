// The Style panel's editors, one per property group (src/core/propertyGroups.ts). The panel shows,
// for the selected Annotation or the active tool, the groups its kind opts into, each through its
// editor here. A new group (Fill: ticket 10; Font and Text outline: ticket 11) adds one entry.
import { type ComponentType, useEffect, useState } from "react";
import type { GroupId, PropertyGroups } from "../../core/propertyGroups";

export interface GroupEditorProps<K extends GroupId> {
  value: PropertyGroups[K];
  onChange(next: PropertyGroups[K]): void;
}

export interface GroupEditor<K extends GroupId> {
  title: string;
  Editor: ComponentType<GroupEditorProps<K>>;
}

export const PALETTE: readonly string[] = [
  "#e02424", // red
  "#f97316", // orange
  "#facc15", // yellow
  "#16a34a", // green
  "#2563eb", // blue
  "#9333ea", // purple
  "#111827", // black
  "#ffffff", // white
];
export const THICKNESS_PRESETS = [2, 4, 8] as const;
export const MIN_THICKNESS = 1;
export const MAX_THICKNESS = 30;

function StrokeEditor({ value, onChange }: GroupEditorProps<"stroke">) {
  // The number box keeps what is typed until it is a valid thickness.
  const [text, setText] = useState(String(value.width));
  useEffect(() => setText(String(value.width)), [value.width]);
  return (
    <>
      <div className="swatches" role="group" aria-label="Color">
        {PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{ background: color }}
            aria-label={`Color ${color}`}
            aria-pressed={value.color.toLowerCase() === color}
            onClick={() => onChange({ ...value, color })}
          />
        ))}
        <input
          type="color"
          className="custom-color"
          aria-label="Custom color"
          value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
        />
      </div>
      <label className="row">
        Thickness
        <input
          type="number"
          min={MIN_THICKNESS}
          max={MAX_THICKNESS}
          aria-label="Thickness"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const width = Math.round(Number(e.target.value));
            if (e.target.value !== "" && width >= MIN_THICKNESS && width <= MAX_THICKNESS) onChange({ ...value, width });
          }}
          onBlur={() => setText(String(value.width))}
        />
        px
      </label>
      <div className="presets" role="group" aria-label="Thickness presets">
        {THICKNESS_PRESETS.map((width) => (
          <button
            key={width}
            type="button"
            aria-pressed={value.width === width}
            aria-label={`Thickness ${width}`}
            onClick={() => onChange({ ...value, width })}
          >
            {width}
          </button>
        ))}
      </div>
    </>
  );
}

function ArrowheadsEditor({ value, onChange }: GroupEditorProps<"arrowheads">) {
  return (
    <div className="presets" role="group" aria-label="Arrowheads">
      <button type="button" aria-pressed={value.ends === "end"} onClick={() => onChange({ ends: "end" })}>
        One end
      </button>
      <button type="button" aria-pressed={value.ends === "both"} onClick={() => onChange({ ends: "both" })}>
        Both ends
      </button>
    </div>
  );
}

export const GROUP_EDITORS: { [K in GroupId]: GroupEditor<K> } = {
  stroke: { title: "Stroke", Editor: StrokeEditor },
  arrowheads: { title: "Arrowheads", Editor: ArrowheadsEditor },
  // fill: { title: "Fill", Editor: FillEditor }, (ticket 10)
  // font, textOutline (ticket 11)
};
