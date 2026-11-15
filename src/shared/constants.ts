import type { CSSProperties } from "react";

/** Single TS source of truth; `src-tauri/src/url_guard.rs` must match (see rustParity.test.ts). */
export const RELEASES_URL = "https://github.com/Hunter-Andrew/screenshot-annotation/releases";

/** Route of the Settings window; `src-tauri/src/lib.rs` must open the same hash (see rustParity.test.ts). */
export const SETTINGS_HASH = "#settings";

/** Shared page-container style for every window's `<main>`. */
export const MAIN_STYLE: CSSProperties = { fontFamily: "system-ui, sans-serif", padding: 16 };
