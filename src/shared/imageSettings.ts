// The image Settings (ticket 37, plus the canvas view), as the editor and Library read them. TS is the single source of truth for
// the values; `src-tauri/src/settings.rs` must spell the same defaults and choices (see rustParity.test.ts).
import { DEFAULT_DARK_BACKGROUND, isBackground } from "../core/area";
import type { Background } from "../core/annotation";

/** How transparency looks in the editor and the Library (never in an Export). */
export type CheckerboardTheme = "dark" | "light";
export const CHECKERBOARD_THEMES: readonly CheckerboardTheme[] = ["dark", "light"];

export interface ImageSettings {
  /** The background a new image starts with (it is stored with the image the first time its area extends past the Capture). */
  background: Background;
  /** The checkerboard drawn behind transparent pixels. */
  checkerboard: CheckerboardTheme;
  /** The room kept around the canvas in the editor view, in pixels. */
  canvasMargin: number;
  /** The room kept around the canvas while the Crop tool is active, in pixels. */
  cropMargin: number;
  /** The colour a Dark background is drawn in, `#rrggbb` (applied when drawing, never stored with an image). */
  darkBackground: string;
  /** How dark the area outside the canvas is shown, in percent (0 to 99.9, to a tenth). */
  outsideDarkness: number;
  /** Whether a new image shows the area outside its canvas. */
  showOutsideDefault: boolean;
  /** The Library Strip is collapsed to a thin bar (a view preference of the editor, kept between launches). */
  libraryStripCollapsed: boolean;
  /** A Text box or Callout widens itself while it is typed in when its lines would be taller than `textMaxHeightRatio` times its width. */
  textAutoWiden: boolean;
  /** How many times taller than wide the lines of a Text box may be before it widens itself while typing (0.5 to 20, to a tenth). */
  textMaxHeightRatio: number;
}

/**
 * An inclusive range of numbers a numeric setting may take (Rust's `settings::Range` and `DecimalRange` spell the
 * same). Whole numbers unless `decimals` says how many decimal places it keeps (the outside darkness: one).
 */
export interface NumberRange {
  min: number;
  max: number;
  default: number;
  decimals?: number;
}

export const CANVAS_MARGIN: NumberRange = { min: 0, max: 200, default: 16 };
/** The Canvas margin while the Crop tool is active (room to drag the handles outwards). */
export const CROP_MARGIN: NumberRange = { min: 0, max: 400, default: 150 };
/** The tallest a Text box's lines may be, as a multiple of its width, before "Widen narrow text boxes" widens it. */
export const TEXT_MAX_HEIGHT_RATIO: NumberRange = { min: 0.5, max: 20, default: 2, decimals: 1 };
export { DEFAULT_DARK_BACKGROUND };
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** True for a `#RRGGBB` string (either case). */
export const isDarkBackground = (value: unknown): value is string => typeof value === "string" && HEX_COLOR.test(value);
/** How dark the outside of the canvas is shown, in percent, to a tenth: 0 to 99.9 (100 would hide it altogether). */
export const OUTSIDE_DARKNESS: NumberRange = { min: 0, max: 99.9, default: 95, decimals: 1 };

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  background: "transparent",
  checkerboard: "light",
  canvasMargin: CANVAS_MARGIN.default,
  cropMargin: CROP_MARGIN.default,
  darkBackground: DEFAULT_DARK_BACKGROUND,
  outsideDarkness: OUTSIDE_DARKNESS.default,
  showOutsideDefault: true,
  libraryStripCollapsed: false,
  textAutoWiden: true,
  textMaxHeightRatio: TEXT_MAX_HEIGHT_RATIO.default,
};

/** `value` rounded to the decimal places the range keeps (whole numbers when it says none). */
const rounded = (range: NumberRange, value: number): number => {
  const unit = 10 ** (range.decimals ?? 0);
  return Math.round(value * unit) / unit;
};

/** True for a number inside the range that has no more decimal places than the range keeps. */
export const inRange = (range: NumberRange, value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && rounded(range, value) === value && value >= range.min && value <= range.max;

/**
 * A number from the platform brought into its range. A whole-number range takes whole numbers only (anything else is
 * the default); a range with decimals rounds to its decimal places. Anything that is not a number is the default.
 */
export const clampToRange = (range: NumberRange, value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return range.default;
  if (!range.decimals && !Number.isInteger(value)) return range.default;
  return Math.min(range.max, Math.max(range.min, rounded(range, value)));
};

export const isCheckerboard = (value: unknown): value is CheckerboardTheme => CHECKERBOARD_THEMES.includes(value as CheckerboardTheme);

/** Settings from the platform, with anything unknown replaced by its default. */
export function sanitizeImageSettings(raw: unknown): ImageSettings {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    background: isBackground(value.background) ? value.background : DEFAULT_IMAGE_SETTINGS.background,
    checkerboard: isCheckerboard(value.checkerboard) ? value.checkerboard : DEFAULT_IMAGE_SETTINGS.checkerboard,
    canvasMargin: clampToRange(CANVAS_MARGIN, value.canvasMargin),
    cropMargin: clampToRange(CROP_MARGIN, value.cropMargin),
    darkBackground: isDarkBackground(value.darkBackground) ? value.darkBackground.toLowerCase() : DEFAULT_DARK_BACKGROUND,
    outsideDarkness: clampToRange(OUTSIDE_DARKNESS, value.outsideDarkness),
    showOutsideDefault: typeof value.showOutsideDefault === "boolean" ? value.showOutsideDefault : DEFAULT_IMAGE_SETTINGS.showOutsideDefault,
    libraryStripCollapsed: value.libraryStripCollapsed === true,
    textAutoWiden: typeof value.textAutoWiden === "boolean" ? value.textAutoWiden : DEFAULT_IMAGE_SETTINGS.textAutoWiden,
    textMaxHeightRatio: clampToRange(TEXT_MAX_HEIGHT_RATIO, value.textMaxHeightRatio),
  };
}
