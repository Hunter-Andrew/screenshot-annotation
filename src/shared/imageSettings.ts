// The image Settings (ticket 37, plus the callout tail and the canvas view), as the editor and Library read them. TS is the single source of truth for
// the values; `src-tauri/src/settings.rs` must spell the same defaults and choices (see rustParity.test.ts).
import { isBackground } from "../core/area";
import type { Background } from "../core/annotation";

/** How transparency looks in the editor and the Library (never in an Export). */
export type CheckerboardTheme = "dark" | "light";
export const CHECKERBOARD_THEMES: readonly CheckerboardTheme[] = ["dark", "light"];

export interface ImageSettings {
  /** The background a new image starts with (it is stored with the image the first time its area extends past the Capture). */
  background: Background;
  /** The checkerboard drawn behind transparent pixels. */
  checkerboard: CheckerboardTheme;
  /** How much of a callout's draw drag its tail takes, in percent. */
  calloutTailPercent: number;
  /** The room kept around the canvas in the editor view, in pixels. */
  canvasMargin: number;
  /** How dark the area outside the canvas is shown, in percent. */
  outsideDarkness: number;
  /** Whether a new image shows the area outside its canvas. */
  showOutsideDefault: boolean;
}

/** An inclusive range of whole numbers a numeric setting may take (Rust's `settings::Range` spells the same). */
export interface NumberRange {
  min: number;
  max: number;
  default: number;
}

export const CALLOUT_TAIL_PERCENT: NumberRange = { min: 5, max: 50, default: 20 };
export const CANVAS_MARGIN: NumberRange = { min: 16, max: 200, default: 48 };
export const OUTSIDE_DARKNESS: NumberRange = { min: 0, max: 95, default: 60 };

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  background: "transparent",
  checkerboard: "light",
  calloutTailPercent: CALLOUT_TAIL_PERCENT.default,
  canvasMargin: CANVAS_MARGIN.default,
  outsideDarkness: OUTSIDE_DARKNESS.default,
  showOutsideDefault: true,
};

export const inRange = (range: NumberRange, value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= range.min && value <= range.max;

/** A number from the platform brought into its range; anything that is not a whole number is the default. */
export const clampToRange = (range: NumberRange, value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) ? Math.min(range.max, Math.max(range.min, value)) : range.default;

export const isCheckerboard = (value: unknown): value is CheckerboardTheme => CHECKERBOARD_THEMES.includes(value as CheckerboardTheme);

/** Settings from the platform, with anything unknown replaced by its default. */
export function sanitizeImageSettings(raw: unknown): ImageSettings {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    background: isBackground(value.background) ? value.background : DEFAULT_IMAGE_SETTINGS.background,
    checkerboard: isCheckerboard(value.checkerboard) ? value.checkerboard : DEFAULT_IMAGE_SETTINGS.checkerboard,
    calloutTailPercent: clampToRange(CALLOUT_TAIL_PERCENT, value.calloutTailPercent),
    canvasMargin: clampToRange(CANVAS_MARGIN, value.canvasMargin),
    outsideDarkness: clampToRange(OUTSIDE_DARKNESS, value.outsideDarkness),
    showOutsideDefault: typeof value.showOutsideDefault === "boolean" ? value.showOutsideDefault : DEFAULT_IMAGE_SETTINGS.showOutsideDefault,
  };
}
