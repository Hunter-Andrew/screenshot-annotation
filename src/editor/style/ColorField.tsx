// The one color control of the Style panel: an optional 8-color palette, the native color picker and
// a hex text field. Every color in the panel (Stroke, Fill, Font color, Text outline color) uses it,
// so a new color control gets the hex option for free.
//
// Hex field: it shows the current color as `#rrggbb`. Typing is applied on Enter or when the field
// loses focus (so "#e0" on the way to "#e02424" never flickers the picture), and a pasted valid
// color applies at once. An invalid draft shows an inline error and never reaches `onPick`; leaving
// the field puts the current color back. Escape does the same. The field follows `color` whenever it
// changes from outside (palette, picker, another annotation selected, undo).
import { useEffect, useId, useState } from "react";
import { parseHexColor } from "../../core/hexColor";

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

export interface ColorFieldProps {
  /** Names the control for assistive tech and tests: "Color", "Fill color", "Text color"... */
  label: string;
  /** The current color, `#rrggbb`. */
  color: string;
  /** Called with a normalized `#rrggbb` that differs from `color` (a palette swatch is called even when equal). */
  onPick(color: string): void;
  /** Palette buttons are named `${swatchLabel} #rrggbb`; defaults to `label`. */
  swatchLabel?: string;
  /** Show the 8-color palette (default true). */
  palette?: boolean;
}

export function ColorField({ label, color, onPick, swatchLabel = label, palette = true }: ColorFieldProps) {
  const [draft, setDraft] = useState(color);
  useEffect(() => setDraft(color), [color]);
  const errorId = useId();
  const invalid = parseHexColor(draft) === null;

  const apply = (text: string) => {
    const parsed = parseHexColor(text);
    if (parsed === null) return false;
    setDraft(parsed);
    if (parsed !== color.toLowerCase()) onPick(parsed);
    return true;
  };

  return (
    <div className="color-field">
      <div className="swatches" role="group" aria-label={label}>
        {palette &&
          PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className="swatch"
              style={{ background: swatch }}
              aria-label={`${swatchLabel} ${swatch}`}
              aria-pressed={color.toLowerCase() === swatch}
              onClick={() => onPick(swatch)}
            />
          ))}
        <input
          type="color"
          className="custom-color"
          aria-label={`Custom ${label.toLowerCase()}`}
          value={color}
          onChange={(e) => onPick(e.target.value)}
        />
        <input
          type="text"
          className={invalid ? "hex-input invalid" : "hex-input"}
          aria-label={`${label} hex`}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          spellCheck={false}
          autoComplete="off"
          maxLength={32}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply(draft);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(color);
            }
          }}
          onPaste={(e) => {
            if (apply(e.clipboardData.getData("text"))) e.preventDefault();
          }}
          onBlur={() => {
            if (!apply(draft)) setDraft(color);
          }}
        />
      </div>
      {invalid && (
        <div id={errorId} className="hex-error" role="alert">
          Use #RGB or #RRGGBB
        </div>
      )}
    </div>
  );
}
