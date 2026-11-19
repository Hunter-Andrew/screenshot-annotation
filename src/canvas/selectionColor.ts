/** The colour of the canvas selection border, handles and drag frames (the app's main accent, ticket 42). Must equal the light `--accent` in src/shared/theme.css. */
export const SELECTION_COLOR = "#520DF2";

/** The faint fill inside a drag frame: the selection colour at 6% opacity. */
export const SELECTION_TINT = `rgba(${[1, 3, 5].map((i) => parseInt(SELECTION_COLOR.slice(i, i + 2), 16)).join(", ")}, 0.06)`;
