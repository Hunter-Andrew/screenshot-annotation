// The two Settings of ticket 37, as the editor and Library read them. TS is the single source of truth for
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
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = { background: "transparent", checkerboard: "dark" };

export const isCheckerboard = (value: unknown): value is CheckerboardTheme => CHECKERBOARD_THEMES.includes(value as CheckerboardTheme);

/** Settings from the platform, with anything unknown replaced by its default. */
export function sanitizeImageSettings(raw: unknown): ImageSettings {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    background: isBackground(value.background) ? value.background : DEFAULT_IMAGE_SETTINGS.background,
    checkerboard: isCheckerboard(value.checkerboard) ? value.checkerboard : DEFAULT_IMAGE_SETTINGS.checkerboard,
  };
}
