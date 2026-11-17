// Styled text (a "run"): per-selection font styling inside a Text or Callout box (M4, ADR 0005 update).
//
// The box's `text` stays plain. `runs` is an optional list of styled ranges over its characters; each range
// overrides some of the box's own Font values (size, bold, italic, underline, color) for those characters only.
// Alignment (horizontal and vertical) and the Text outline stay whole-box and are never in a run.
//
// A "character" is a grapheme (what a user sees as one letter; an emoji with a modifier is one), counted over the
// whole text with "\n" as one character: the same indices Fabric uses for its caret and its per-character styles,
// so the canvas and the model agree. `from` is inclusive, `to` exclusive.
//
// The stored list is always in one normal form (`normalizeRuns`): sorted, not overlapping, clipped to the text,
// no run over a newline, neighbours with the same style merged, no empty run, no value equal to the box's own.
// A box with no styled ranges stores no `runs` at all.
import { HEX, type Font } from "../propertyGroups";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "./text";

export interface RunFont {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** CSS hex, lower case. */
  color?: string;
}

export interface Run {
  from: number;
  to: number;
  font: RunFont;
}

/** The properties a run can override: the Font's per-selection ones. */
export const RUN_KEYS = ["size", "bold", "italic", "underline", "color"] as const;
export type RunKey = (typeof RUN_KEYS)[number];

/** A property's value over a selection: the one value they all share, or "mixed". */
export type Mixed<T> = T | "mixed";
export interface SelectionFont {
  size: Mixed<number>;
  bold: Mixed<boolean>;
  italic: Mixed<boolean>;
  underline: Mixed<boolean>;
  color: Mixed<string>;
}

let segmenter: Intl.Segmenter | undefined;
/** The characters (graphemes) of a text, as Fabric counts them. */
export function splitChars(text: string): string[] {
  segmenter ??= typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

export const charCount = (text: string): number => splitChars(text).length;

/** The box's own value of a run property. */
export function baseValue(base: Font, key: RunKey): RunFont[RunKey] {
  return key === "underline" ? base.underline === true : base[key];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The valid properties of a stored run font (anything else is dropped). */
function readFont(raw: unknown): RunFont {
  const font: RunFont = {};
  if (!isRecord(raw)) return font;
  if (typeof raw.size === "number" && Number.isInteger(raw.size) && raw.size >= MIN_FONT_SIZE && raw.size <= MAX_FONT_SIZE) font.size = raw.size;
  if (typeof raw.bold === "boolean") font.bold = raw.bold;
  if (typeof raw.italic === "boolean") font.italic = raw.italic;
  if (typeof raw.underline === "boolean") font.underline = raw.underline;
  if (typeof raw.color === "string" && HEX.test(raw.color)) font.color = raw.color.toLowerCase();
  return font;
}

const sameFont = (a: RunFont, b: RunFont) => RUN_KEYS.every((key) => a[key] === b[key]);

/**
 * The normal form of a list of runs over `text`: anything malformed is dropped (a reader of a stored file may call
 * this with whatever the file held), the rest is clipped, layered (a later run wins, property by property, where
 * runs overlap), split around newlines, merged and sorted. With `base` (the box's own font), a value equal to the
 * box's is no override and is dropped too.
 */
export function normalizeRuns(raw: unknown, text: string, base?: Font): Run[] {
  if (!Array.isArray(raw)) return [];
  const chars = splitChars(text);
  const perChar: RunFont[] = chars.map(() => ({}));
  for (const entry of raw) {
    if (!isRecord(entry) || !Number.isInteger(entry.from) || !Number.isInteger(entry.to)) continue;
    const font = readFont(entry.font);
    if (Object.keys(font).length === 0) continue;
    const from = Math.max(0, entry.from as number);
    const to = Math.min(chars.length, entry.to as number);
    for (let i = from; i < to; i++) if (chars[i] !== "\n") Object.assign(perChar[i]!, font);
  }
  const runs: Run[] = [];
  perChar.forEach((layered, i) => {
    const font: RunFont = {};
    for (const key of RUN_KEYS) {
      const value = layered[key];
      if (value !== undefined && (!base || value !== baseValue(base, key))) (font as Record<string, unknown>)[key] = value;
    }
    if (Object.keys(font).length === 0) return;
    const last = runs.at(-1);
    if (last && last.to === i && sameFont(last.font, font)) last.to = i + 1;
    else runs.push({ from: i, to: i + 1, font });
  });
  return runs;
}

/** The runs with the characters from..to also styled by `patch` (which wins over what was there). */
export function styleRange(runs: readonly Run[], from: number, to: number, patch: RunFont, text: string, base?: Font): Run[] {
  return normalizeRuns([...runs, { from, to, font: patch }], text, base);
}

/** The runs with these properties removed everywhere (a whole-box change of them), and any run left plain dropped. */
export function resetRunKeys(runs: readonly Run[], keys: readonly RunKey[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const font: RunFont = { ...run.font };
    for (const key of keys) delete font[key];
    if (Object.keys(font).length > 0) out.push({ ...run, font });
  }
  return out;
}

/** The whole-box font properties a change of `before` into `after` touched. */
export function changedRunKeys(before: Font, after: Font): RunKey[] {
  return RUN_KEYS.filter((key) => baseValue(before, key) !== baseValue(after, key));
}

/**
 * What the characters from..to (the selection) look like: for each property the value they all share, or "mixed".
 * A character's value is its run's override, else the box's own. Newlines have no look and do not count.
 */
export function selectionFont(runs: readonly Run[], base: Font, text: string, from: number, to: number): SelectionFont {
  const chars = splitChars(text);
  const found: Record<RunKey, Set<unknown>> = { size: new Set(), bold: new Set(), italic: new Set(), underline: new Set(), color: new Set() };
  for (let i = Math.max(0, from); i < Math.min(chars.length, to); i++) {
    if (chars[i] === "\n") continue;
    const run = runs.find((r) => r.from <= i && i < r.to);
    for (const key of RUN_KEYS) found[key].add(run?.font[key] ?? baseValue(base, key));
  }
  const value = <K extends RunKey>(key: K): Mixed<NonNullable<RunFont[K]>> => {
    const set = found[key] as Set<NonNullable<RunFont[K]>>;
    return set.size === 1 ? [...set][0]! : set.size === 0 ? (baseValue(base, key) as NonNullable<RunFont[K]>) : "mixed";
  };
  return { size: value("size"), bold: value("bold"), italic: value("italic"), underline: value("underline"), color: value("color") };
}

/**
 * The Annotation with its `runs` in normal form for its own text (the key is left out when no run is left).
 * Anything that is not a Text or a Callout is returned as it is. The one place stored or edited runs are cleaned:
 * an edit that adds or updates a box, and the reader of a saved image, both call it.
 */
export function tidyRuns<A extends { type: string }>(annotation: A): A {
  if (annotation.type !== "text" && annotation.type !== "callout") return annotation;
  const box = annotation as unknown as { text: unknown; runs?: unknown };
  if (!("runs" in box)) return annotation;
  const { runs, ...rest } = box;
  const clean = normalizeRuns(runs, typeof box.text === "string" ? box.text : "");
  return (clean.length > 0 ? { ...rest, runs: clean } : rest) as unknown as A;
}
