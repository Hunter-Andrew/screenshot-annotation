import type { CSSProperties } from "react";

/** Single TS source of truth; `src-tauri/src/url_guard.rs` must match (see rustParity.test.ts). */
export const RELEASES_URL = "https://github.com/Hunter-Andrew/screenshot-annotation/releases";

/** Route of the Settings window; `src-tauri/src/lib.rs` must open the same hash (see rustParity.test.ts). */
export const SETTINGS_HASH = "#settings";
/** Opens Settings straight on the keyboard shortcuts screen (reloads and tests land there). */
export const SHORTCUTS_HASH = "#settings/shortcuts";

/** Route of a capture overlay window: `#overlay/<monitor index>`; `src-tauri/src/overlay.rs` must open the same prefix (see rustParity.test.ts). */
export const OVERLAY_HASH_PREFIX = "#overlay/";

/** Shared page-container style for every window's `<main>`. */
export const MAIN_STYLE: CSSProperties = { fontFamily: "system-ui, sans-serif", padding: 16 };

/** Route of the delay timer's countdown badge window; `src-tauri/src/countdown.rs` must open the same hash (see rustParity.test.ts). */
export const COUNTDOWN_HASH = "#countdown";

/** Route of the laser pointer window; `src-tauri/src/laser_pointer.rs` must open the same hash (see rustParity.test.ts). */
export const LASER_POINTER_HASH = "#laser-pointer";
/** Route of a Drawing mode overlay window: `#drawing/<monitor index>`; `src-tauri/src/drawing.rs` must open the same prefix (see rustParity.test.ts). */
export const DRAWING_HASH_PREFIX = "#drawing/";
/** Route of the Drawing mode toolbar window; `src-tauri/src/drawing.rs` must open the same hash (see rustParity.test.ts). */
export const DRAWING_TOOLBAR_HASH = "#drawing-toolbar";
/** The toolbar window's size in CSS pixels, expanded and collapsed; `src-tauri/src/drawing_plan.rs` must use the same numbers (see rustParity.test.ts). */
export const DRAWING_TOOLBAR_SIZE = { width: 396, height: 48 } as const;
export const DRAWING_TOOLBAR_COLLAPSED_SIZE = { width: 72, height: 48 } as const;
