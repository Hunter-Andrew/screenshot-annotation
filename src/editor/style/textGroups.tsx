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
import { isUnderlined, TEXT_ALIGNS, type TextAlign, VERTICAL_ALIGNS, type VerticalAlign, valignOf } from "../../core/propertyGroups";
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
  /** "mixed": the selection has several sizes; the box is empty and says so. */
  value: number | "mixed";
  min: number;
  max: number;
  label: string;
  onValid(next: number): void;
}) {
  const shown = value === "mixed" ? "" : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <input
      type="number"
      min={min}
      max={max}
      aria-label={label}
      placeholder={value === "mixed" ? "mixed" : undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const next = Math.round(Number(e.target.value));
        if (e.target.value !== "" && next >= min && next <= max) onValid(next);
      }}
      onBlur={() => setText(shown)}
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

/** A text block of three lines at the top, the middle or the bottom of a frame. */
function VerticalAlignIcon({ valign }: { valign: VerticalAlign }) {
  const y = valign === "top" ? 4 : valign === "middle" ? 7 : 10;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1.5 1h13M1.5 15h13" strokeWidth="1" opacity="0.5" />
      {[0, 2.6, 5.2].map((dy, i) => (
        <path key={i} d={`M3 ${y + dy}h${i === 2 ? 6 : 10}`} />
      ))}
    </svg>
  );
}

export function FontEditor({ value, onChange, selection }: GroupEditorProps<"font">) {
  // With characters selected the size, B, I, U and color show and change the selection only; the alignments never do.
  const look = selection?.font ?? { size: value.size, bold: value.bold, italic: value.italic, underline: isUnderlined(value), color: value.color };
  const size = look.size;
  const preset = typeof size === "number" && (FONT_SIZE_PRESETS as readonly number[]).includes(size) ? String(size) : "";
  const setSize = (next: number) => (selection ? selection.onStyle({ size: clampFontSize(next) }) : onChange({ ...value, size: clampFontSize(next) }));
  /** A toggle: all on turns off; off, or mixed, turns on (Word's rule). */
  const toggle = (property: "bold" | "italic" | "underline") => {
    const on = look[property] !== true;
    if (selection) selection.onStyle({ [property]: on });
    else onChange({ ...value, [property]: on });
  };
  const pressed = (property: "bold" | "italic" | "underline") => (look[property] === "mixed" ? "mixed" : look[property] === true);
  return (
    <>
      <label className="row">
        Size
        <NumberBox label="Font size" min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} value={size} onValid={setSize} />
        px
        <select aria-label="Font size presets" value={preset} onChange={(e) => e.target.value && setSize(Number(e.target.value))}>
          <option value="">Presets</option>
          {FONT_SIZE_PRESETS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="presets" role="group" aria-label="Style">
        <button type="button" aria-pressed={pressed("bold")} aria-label="Bold" style={{ fontWeight: 700 }} title="Bold (Ctrl+B while typing)" onClick={() => toggle("bold")}>
          B
        </button>
        <button type="button" aria-pressed={pressed("italic")} aria-label="Italic" style={{ fontStyle: "italic" }} title="Italic (Ctrl+I while typing)" onClick={() => toggle("italic")}>
          I
        </button>
        <button type="button" aria-pressed={pressed("underline")} aria-label="Underline" title="Underline (Ctrl+U while typing)" style={{ textDecoration: "underline" }} onClick={() => toggle("underline")}>
          U
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
        {VERTICAL_ALIGNS.map((valign) => (
          <button
            key={valign}
            type="button"
            aria-pressed={valignOf(value) === valign}
            aria-label={`Align ${valign}`}
            title={`Align ${valign}`}
            onClick={() => onChange({ ...value, valign })}
          >
            <VerticalAlignIcon valign={valign} />
          </button>
        ))}
      </div>
      <ColorField
        label="Text color"
        swatchLabel="Color"
        color={look.color === "mixed" ? value.color : look.color}
        mixed={look.color === "mixed"}
        onPick={(color) => (selection ? selection.onStyle({ color }) : onChange({ ...value, color }))}
      />
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
