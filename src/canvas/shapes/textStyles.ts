// The two-way mapping between the model's runs (src/core/annotations/runs.ts: ranges over the characters of the
// whole text) and Fabric's own per-character styles (`{ [line]: { [character in the line]: style } }`, where a line
// is a hard line, one ended by "\n"). Pure data, no Fabric import, so it is unit tested without a canvas.
import { type Font } from "../../core/propertyGroups";
import { normalizeRuns, type Run, type RunFont, splitChars } from "../../core/annotations/runs";

/** What Fabric keeps for one character: only what differs from the object's own value. */
export interface CharStyle {
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  underline?: boolean;
  fill?: string;
}
export type FabricStyles = Record<number, Record<number, CharStyle>>;

/** A run's font in Fabric's words. */
export function toCharStyle(font: RunFont): CharStyle {
  const style: CharStyle = {};
  if (font.size !== undefined) style.fontSize = font.size;
  if (font.bold !== undefined) style.fontWeight = font.bold ? "bold" : "normal";
  if (font.italic !== undefined) style.fontStyle = font.italic ? "italic" : "normal";
  if (font.underline !== undefined) style.underline = font.underline;
  if (font.color !== undefined) style.fill = font.color;
  return style;
}

function fromCharStyle(style: CharStyle): RunFont {
  const font: RunFont = {};
  if (typeof style.fontSize === "number") font.size = style.fontSize;
  if (style.fontWeight !== undefined) font.bold = style.fontWeight === "bold" || Number(style.fontWeight) >= 600;
  if (style.fontStyle !== undefined) font.italic = style.fontStyle === "italic" || style.fontStyle === "oblique";
  if (typeof style.underline === "boolean") font.underline = style.underline;
  if (typeof style.fill === "string") font.color = style.fill;
  return font;
}

/** Fabric's styles for `runs` over `text`. */
export function runsToStyles(runs: readonly Run[], text: string): FabricStyles {
  const styles: FabricStyles = {};
  let index = 0; // character index over the whole text
  text.split("\n").forEach((line, lineIndex) => {
    splitChars(line).forEach((_, charIndex) => {
      const run = runs.find((r) => r.from <= index && index < r.to);
      if (run) (styles[lineIndex] ??= {})[charIndex] = toCharStyle(run.font);
      index++;
    });
    index++; // the newline
  });
  return styles;
}

/**
 * The runs Fabric's styles describe for `text`, in the model's normal form, with what equals the box's own `base` font
 * left out. Styles that point past the text (Fabric lets go of those lazily) are ignored.
 */
export function stylesToRuns(styles: FabricStyles | undefined, text: string, base: Font): Run[] {
  if (!styles) return [];
  const perChar: Run[] = [];
  let index = 0;
  text.split("\n").forEach((line, lineIndex) => {
    const row = styles[lineIndex];
    splitChars(line).forEach((_, charIndex) => {
      const style = row?.[charIndex];
      if (style) perChar.push({ from: index, to: index + 1, font: fromCharStyle(style) });
      index++;
    });
    index++;
  });
  return normalizeRuns(perChar, text, base);
}
