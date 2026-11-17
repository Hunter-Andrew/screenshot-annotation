// The Style panel's editors, one per property group (src/core/propertyGroups.ts). The panel shows,
// for the selected Annotation or the active tool, the groups its kind opts into, each through its
// editor here. A new group (Fill: ticket 10; Font and Text outline: ticket 11) adds one entry.
import { type ComponentType, useEffect, useState } from "react";
import {
  MAX_ERASER_SIZE,
  MIN_ERASER_SIZE,
  MAX_OPACITY,
  MAX_STRENGTH,
  MAX_STROKE_WIDTH,
  MIN_OPACITY,
  MIN_STRENGTH,
  MIN_STROKE_WIDTH, type GroupId, type PropertyGroups } from "../../core/propertyGroups";
import type { RunFont, SelectionFont } from "../../core/annotations/runs";
import { ColorField, PALETTE } from "./ColorField";
import { FontEditor, TextOutlineEditor } from "./textGroups";

/** The Font group while characters are selected in a Text or Callout being typed in: what they look like, and how to restyle them. */
export interface SelectionEdit {
  font: SelectionFont;
  /** Style the selected characters only. */
  onStyle(patch: RunFont): void;
}

export interface GroupEditorProps<K extends GroupId> {
  value: PropertyGroups[K];
  onChange(next: PropertyGroups[K]): void;
  /** Only the Font editor reads it: set while characters are selected, so B, I, U, size and color change those characters only. */
  selection?: SelectionEdit | null;
}

export interface GroupEditor<K extends GroupId> {
  title: string;
  Editor: ComponentType<GroupEditorProps<K>>;
}

export { PALETTE };
export const THICKNESS_PRESETS = [2, 4, 8] as const;

function StrokeEditor({ value, onChange }: GroupEditorProps<"stroke">) {
  // The number box keeps what is typed until it is a valid thickness.
  const [text, setText] = useState(String(value.width));
  useEffect(() => setText(String(value.width)), [value.width]);
  return (
    <>
      <ColorField label="Color" color={value.color} onPick={(color) => onChange({ ...value, color })} />
      <label className="row">
        Thickness
        <input
          type="number"
          min={MIN_STROKE_WIDTH}
          max={MAX_STROKE_WIDTH}
          aria-label="Thickness"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const width = Math.round(Number(e.target.value));
            if (e.target.value !== "" && width >= MIN_STROKE_WIDTH && width <= MAX_STROKE_WIDTH) onChange({ ...value, width });
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

function BorderEditor({ value, onChange }: GroupEditorProps<"border">) {
  // Off by default; the color and width are kept while it is off. Width 1-30 like a Stroke (presets 2, 4, 8).
  const [text, setText] = useState(String(value.width));
  useEffect(() => setText(String(value.width)), [value.width]);
  return (
    <>
      <div className="presets" role="group" aria-label="Border mode">
        <button type="button" aria-pressed={!value.enabled} onClick={() => onChange({ ...value, enabled: false })}>
          Off
        </button>
        <button type="button" aria-pressed={value.enabled} onClick={() => onChange({ ...value, enabled: true })}>
          On
        </button>
      </div>
      {value.enabled && (
        <>
          <ColorField label="Border color" color={value.color} onPick={(color) => onChange({ ...value, color })} />
          <label className="row">
            Width
            <input
              type="number"
              min={MIN_STROKE_WIDTH}
              max={MAX_STROKE_WIDTH}
              aria-label="Border width"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                const width = Math.round(Number(e.target.value));
                if (e.target.value !== "" && width >= MIN_STROKE_WIDTH && width <= MAX_STROKE_WIDTH) onChange({ ...value, width });
              }}
              onBlur={() => setText(String(value.width))}
            />
            px
          </label>
          <div className="presets" role="group" aria-label="Border width presets">
            {THICKNESS_PRESETS.map((width) => (
              <button
                key={width}
                type="button"
                aria-pressed={value.width === width}
                aria-label={`Border width ${width}`}
                onClick={() => onChange({ ...value, width })}
              >
                {width}
              </button>
            ))}
          </div>
        </>
      )}
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

const FILL_MODES = [
  { mode: "none", label: "None" },
  { mode: "solid", label: "Solid" },
  { mode: "semi", label: "Semi-transparent" },
] as const;

function FillEditor({ value, onChange }: GroupEditorProps<"fill">) {
  return (
    <>
      <div className="presets" role="group" aria-label="Fill mode">
        {FILL_MODES.map(({ mode, label }) => (
          <button key={mode} type="button" aria-pressed={value.mode === mode} onClick={() => onChange({ ...value, mode })}>
            {label}
          </button>
        ))}
      </div>
      {value.mode !== "none" && (
        <ColorField label="Fill color" color={value.color} onPick={(color) => onChange({ ...value, color })} />
      )}
      {value.mode === "semi" && (
        <label className="row">
          Opacity
          <input
            type="range"
            min={1}
            max={100}
            aria-label="Fill opacity"
            value={Math.round(value.opacity * 100)}
            onChange={(e) => onChange({ ...value, opacity: Number(e.target.value) / 100 })}
          />
          {Math.round(value.opacity * 100)}%
        </label>
      )}
    </>
  );
}

function TailEditor({ value, onChange }: GroupEditorProps<"tail">) {
  return (
    <div className="presets" role="group" aria-label="Tail">
      <button type="button" aria-pressed={value.enabled} onClick={() => onChange({ enabled: true })}>
        On
      </button>
      <button type="button" aria-pressed={!value.enabled} onClick={() => onChange({ enabled: false })}>
        Off
      </button>
    </div>
  );
}

function OpacityEditor({ value, onChange }: GroupEditorProps<"opacity">) {
  const percent = Math.round(value.value * 100);
  const [text, setText] = useState(String(percent));
  useEffect(() => setText(String(percent)), [percent]);
  const lo = Math.round(MIN_OPACITY * 100);
  const hi = Math.round(MAX_OPACITY * 100);
  return (
    <label className="row">
      Opacity
      <input
        type="range"
        min={lo}
        max={hi}
        aria-label="Opacity"
        value={percent}
        onChange={(e) => onChange({ value: Number(e.target.value) / 100 })}
      />
      <input
        type="number"
        min={lo}
        max={hi}
        aria-label="Opacity percent"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Math.round(Number(e.target.value));
          if (e.target.value !== "" && n >= lo && n <= hi) onChange({ value: n / 100 });
        }}
        onBlur={() => setText(String(percent))}
      />
      %
    </label>
  );
}

function StrengthEditor({ value, onChange }: GroupEditorProps<"strength">) {
  const [text, setText] = useState(String(value.blockSize));
  useEffect(() => setText(String(value.blockSize)), [value.blockSize]);
  return (
    <label className="row">
      Block size
      <input
        type="range"
        min={MIN_STRENGTH}
        max={MAX_STRENGTH}
        aria-label="Strength"
        value={value.blockSize}
        onChange={(e) => onChange({ blockSize: Number(e.target.value) })}
      />
      <input
        type="number"
        min={MIN_STRENGTH}
        max={MAX_STRENGTH}
        aria-label="Block size"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Math.round(Number(e.target.value));
          if (e.target.value !== "" && n >= MIN_STRENGTH && n <= MAX_STRENGTH) onChange({ blockSize: n });
        }}
        onBlur={() => setText(String(value.blockSize))}
      />
      px
    </label>
  );
}

/** The Pen tool's Mode: draw, or erase parts of Pen strokes; and how big the eraser is. Only while the tool is active. */
function EraserEditor({ value, onChange }: GroupEditorProps<"eraser">) {
  const [text, setText] = useState(String(value.size));
  useEffect(() => setText(String(value.size)), [value.size]);
  return (
    <>
      <div className="presets" role="group" aria-label="Pen mode">
        <button type="button" aria-pressed={value.mode === "pen"} onClick={() => onChange({ ...value, mode: "pen" })}>
          Pen
        </button>
        <button type="button" aria-pressed={value.mode === "eraser"} onClick={() => onChange({ ...value, mode: "eraser" })}>
          Eraser
        </button>
      </div>
      <label className="row">
        Eraser size
        <input
          type="range"
          min={MIN_ERASER_SIZE}
          max={MAX_ERASER_SIZE}
          aria-label="Eraser size"
          value={value.size}
          onChange={(e) => onChange({ ...value, size: Number(e.target.value) })}
        />
        <input
          type="number"
          min={MIN_ERASER_SIZE}
          max={MAX_ERASER_SIZE}
          aria-label="Eraser size number"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const size = Math.round(Number(e.target.value));
            if (e.target.value !== "" && size >= MIN_ERASER_SIZE && size <= MAX_ERASER_SIZE) onChange({ ...value, size });
          }}
          onBlur={() => setText(String(value.size))}
        />
        px
      </label>
    </>
  );
}

export const GROUP_EDITORS: { [K in GroupId]: GroupEditor<K> } = {
  eraser: { title: "Mode", Editor: EraserEditor },
  strength: { title: "Strength", Editor: StrengthEditor },
  stroke: { title: "Stroke", Editor: StrokeEditor },
  border: { title: "Border", Editor: BorderEditor },
  tail: { title: "Tail", Editor: TailEditor },
  opacity: { title: "Opacity", Editor: OpacityEditor },
  arrowheads: { title: "Arrowheads", Editor: ArrowheadsEditor },
  fill: { title: "Fill", Editor: FillEditor },
  font: { title: "Font", Editor: FontEditor },
  textOutline: { title: "Text outline", Editor: TextOutlineEditor },
};
