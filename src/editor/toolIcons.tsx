// The tool column's icons: small inline SVGs, no dependency, no network. One entry per tool id (the id
// is the shortcut table's `tool.<id>` suffix), so adding a tool adds one entry here; a test fails when a
// tool in the shortcut table has no icon. 24 x 24 grid, 2 px strokes centred on whole numbers (crisp at
// 1x and 2x), `currentColor` so they follow the button's text color and the selected state.
import type { ReactNode } from "react";

const SIZE = 24;

export const TOOL_ICONS: Readonly<Record<string, ReactNode>> = {
  // Pointer arrow.
  select: <path d="M6 3 L6 19 L10 15 L13 21 L16 20 L13 14 L19 14 Z" />,
  // Line with an arrowhead at the end.
  arrow: (
    <>
      <path d="M4 20 L19 5" />
      <path d="M9 5 L19 5 L19 15" />
    </>
  ),
  line: <path d="M4 20 L20 4" />,
  // Wavy freehand stroke.
  pen: <path d="M3 15 C6 6 9 6 12 12 S18 18 21 8" />,
  rect: <rect x="4" y="6" width="16" height="12" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="7" />,
  // A capital T.
  text: (
    <>
      <path d="M5 6 L5 4 L19 4 L19 6" />
      <path d="M12 4 L12 20" />
      <path d="M9 20 L15 20" />
    </>
  ),
  // A rounded box with a line of text in it.
  textbox: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 10 L16 10 M8 14 L13 14" />
    </>
  ),
  // Speech bubble with a tail.
  callout: <path d="M4 5 L20 5 L20 16 L11 16 L6 21 L6 16 L4 16 Z" />,
  // Marker with a highlighted band under it.
  highlight: (
    <>
      <path d="M14 3 L20 9 L11 18 L5 18 L5 12 Z" />
      <path d="M3 21 L21 21" strokeWidth="3" opacity="0.5" />
    </>
  ),
  // A grid of squares: pixelation.
  blur: (
    <>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M4 12 L20 12 M12 4 L12 20" />
      <rect x="12" y="12" width="8" height="8" fill="currentColor" stroke="none" opacity="0.5" />
    </>
  ),
  // Crop marks.
  crop: (
    <>
      <path d="M7 2 L7 17 L22 17" />
      <path d="M2 7 L17 7 L17 22" />
    </>
  ),
};

/** The icon for a tool id; nothing for an unknown id (a test keeps the registry and the table in step). */
export function ToolIcon({ id }: { id: string }) {
  const body = TOOL_ICONS[id];
  if (!body) return null;
  return (
    <svg
      className="tool-icon"
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {body}
    </svg>
  );
}
