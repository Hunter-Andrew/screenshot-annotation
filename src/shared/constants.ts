import type { CSSProperties } from "react";

/** Single TS source of truth; `src-tauri/src/url_guard.rs` must match (see rustParity.test.ts). */
export const RELEASES_URL = "https://github.com/Hunter-Andrew/screenshot-annotation/releases";

/** Route of the Settings window; `src-tauri/src/lib.rs` must open the same hash (see rustParity.test.ts). */
export const SETTINGS_HASH = "#settings";

/** Route of a capture overlay window: `#overlay/<monitor index>`; `src-tauri/src/overlay.rs` must open the same prefix (see rustParity.test.ts). */
export const OVERLAY_HASH_PREFIX = "#overlay/";

/** Shared page-container style for every window's `<main>`. */
export const MAIN_STYLE: CSSProperties = { fontFamily: "system-ui, sans-serif", padding: 16 };

/** Route of the delay timer's countdown badge window; `src-tauri/src/countdown.rs` must open the same hash (see rustParity.test.ts). */
export const COUNTDOWN_HASH = "#countdown";

/** Route of the pointer highlight window; `src-tauri/src/pointer_highlight.rs` must open the same hash (see rustParity.test.ts). */
export const POINTER_HIGHLIGHT_HASH = "#pointer-highlight";
/** Route of a Drawing mode overlay window: `#drawing/<monitor index>`; `src-tauri/src/drawing.rs` must open the same prefix (see rustParity.test.ts). */
export const DRAWING_HASH_PREFIX = "#drawing/";
