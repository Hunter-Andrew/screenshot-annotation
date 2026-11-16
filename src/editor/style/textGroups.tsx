// The Style panel editors of the Font and Text outline groups (registered in ./groups.tsx).
import { useEffect, useState } from "react";
import {
  clampFontSize,
  FONT_SIZE_PRESETS,
  MAX_FONT_SIZE,
  MAX_OUTLINE_WIDTH,
  MIN_FONT_SIZE,
  MIN_OUTLINE_WIDTH,
} from "../../core/annotations/text";
import { TEXT_ALIGNS, type TextAlign } from "../../core/propertyGroups";
import { ColorField } from "./ColorField";
import type { GroupEditorProps } from "./groups";

/** A whole-number box that keeps what is typed until it is valid, and only then reports it. */
function NumberBox({
  value,
  min,
  max,
  label,
  onValid,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onValid(next: number): void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      min={min}
      max={max}
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const next = Math.round(Number(e.target.value));
        if (e.target.value !== "" && next >= min && next <= max) onValid(next);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/** Four lines of different lengths, hugging the left, the middle or the right edge: the usual alignment icon. */
function AlignIcon({ align }: { align: TextAlign }) {
  const lines = [14, 9, 14, 6];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {lines.map((length, i) => {
        const x1 = align === "left" ? 1 : align === "right" ? 15 - length : 8 - length / 2;
        return <path key={i} d={`M${x1} ${3 + i * 3.4}h${length}`} />;
      })}
    </svg>
  );
}

export function FontEditor({ value, onChange }: GroupEditorProps<"font">) {
  const preset = (FONT_SIZE_PRESETS as readonly number[]).includes(value.size) ? String(value.size) : "";
  return (
    <>
      <label className="row">
        Size
        <NumberBox
          label="Font size"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          value={value.size}
          onValid={(size) => onChange({ ...value, size: clampFontSize(size) })}
        />
        px
        <select
          aria-label="Font size presets"
          value={preset}
          onChange={(e) => e.target.value && onChange({ ...value, size: Number(e.target.value) })}
        >
          <option value="">Presets</option>
          {FONT_SIZE_PRESETS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="presets" role="group" aria-label="Style">
        <button
          type="button"
          aria-pressed={value.bold}
          aria-label="Bold"
          style={{ fontWeight: 700 }}
          onClick={() => onChange({ ...value, bold: !value.bold })}
        >
          B
        </button>
        <button
          type="button"
          aria-pressed={value.italic}
          aria-label="Italic"
          style={{ fontStyle: "italic" }}
          onClick={() => onChange({ ...value, italic: !value.italic })}
        >
          I
        </button>
      </div>
      <div className="presets" role="group" aria-label="Alignment">
        {TEXT_ALIGNS.map((align) => (
          <button
            key={align}
            type="button"
            aria-pressed={(value.align ?? "left") === align}
            aria-label={`Align ${align}`}
            title={`Align ${align}`}
            onClick={() => onChange({ ...value, align })}
          >
            <AlignIcon align={align} />
          </button>
        ))}
      </div>
      <ColorField label="Text color" swatchLabel="Color" color={value.color} onPick={(color) => onChange({ ...value, color })} />
    </>
  );
}

export function TextOutlineEditor({ value, onChange }: GroupEditorProps<"textOutline">) {
  return (
    <>
      <label className="row">
        <input
          type="checkbox"
          aria-label="Outline"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Outline
      </label>
      {value.enabled && (
        <>
          <ColorField label="Outline color" swatchLabel="Color" color={value.color} onPick={(color) => onChange({ ...value, color })} />
          <label className="row">
            Width
            <NumberBox
              label="Outline width"
              min={MIN_OUTLINE_WIDTH}
              max={MAX_OUTLINE_WIDTH}
              value={value.width}
              onValid={(width) => onChange({ ...value, width })}
            />
            px
          </label>
        </>
      )}
    </>
  );
}
