// The Drawing mode toolbar's icons, in the style of the editor's tool icons (src/editor/toolIcons.tsx): inline
// SVG on a 24 x 24 grid, 2 px round strokes, `currentColor`. The four tools reuse the editor's own icons, so the
// toolbar and the editor show the same Arrow, Rectangle, Pen and Highlighter.
import type { ReactNode } from "react";
import { TOOL_ICONS } from "../editor/toolIcons";
import type { ToolbarButtonId } from "./toolbarState";

const OWN_ICONS: Readonly<Record<string, ReactNode>> = {
  // A pointer arrow: the mouse goes to the app below.
  useApps: <path d="M6 3 L6 19 L10 15 L13 21 L16 20 L13 14 L19 14 Z" />,
  // An eraser block, tilted, with the line it wipes.
  eraser: (
    <>
      <path d="M8 20 L3.5 15.5 C2.8 14.8 2.8 13.7 3.5 13 L13 3.5 C13.7 2.8 14.8 2.8 15.5 3.5 L20.5 8.5 C21.2 9.2 21.2 10.3 20.5 11 L11 20.5" />
      <path d="M8 20 L21 20" />
      <path d="M9 7 L17 15" />
    </>
  ),
  // A curved arrow going back.
  undo: (
    <>
      <path d="M9 5 L4 10 L9 15" />
      <path d="M4 10 L14 10 C18 10 20 12 20 15 C20 18 18 20 14 20 L10 20" />
    </>
  ),
  // A chevron pointing at the toolbar's edge, to fold it away.
  collapse: <path d="M6 15 L12 9 L18 15" />,
  expand: <path d="M6 9 L12 15 L18 9" />,
  exit: <path d="M6 6 L18 18 M18 6 L6 18" />,
};

export function ToolbarIcon({ id }: { id: ToolbarButtonId | "expand" }) {
  const body = OWN_ICONS[id] ?? TOOL_ICONS[id];
  if (!body) return null;
  return (
    <svg
      width={20}
      height={20}
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
