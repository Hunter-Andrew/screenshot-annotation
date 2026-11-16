// Resizing a Text box by its handles (M3 testing note). Every handle changes the BOX and never the
// font size: the sides and corners change the wrap width (where lines break) and the box's height
// (a minimum: the box is never shorter than its lines), and dragging the left or top edge moves the box.
// Pure geometry in Capture pixels; the Fabric object (src/canvas/shapes/textShape.ts) applies the result.

/** A box as the Text shape has it: `height` is the real height (its lines, or the minimum if taller). */
export interface TextBoxGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Which edges a handle moves: -1 the left or top edge, 1 the right or bottom edge, 0 that axis stays. */
export interface HandleEdges {
  fx: -1 | 0 | 1;
  fy: -1 | 0 | 1;
}

export const HANDLES = {
  tl: { fx: -1, fy: -1 },
  mt: { fx: 0, fy: -1 },
  tr: { fx: 1, fy: -1 },
  ml: { fx: -1, fy: 0 },
  mr: { fx: 1, fy: 0 },
  bl: { fx: -1, fy: 1 },
  mb: { fx: 0, fy: 1 },
  br: { fx: 1, fy: 1 },
} as const satisfies Record<string, HandleEdges>;

export type HandleName = keyof typeof HANDLES;

/** A box is never made narrower than this by a handle (it would be a sliver the text cannot use). */
export const MIN_BOX_WIDTH = 20;

export interface BoxDrag {
  left: number;
  width: number;
  /** The wanted minimum height, or undefined when the drag does not touch the height. */
  minHeight?: number;
  /** The drag moves the top edge: once the text is laid out, put the top where the fixed bottom edge needs it. */
  keepBottom: boolean;
}

/**
 * Where a handle drag asks the box to be. `pad` is the outline the shape draws around its box (the
 * visible selection box is that much bigger than `width` and `height`). The edge opposite the handle
 * stays where it is; a handle dragged past the opposite edge stops at the minimum width instead of
 * flipping the box.
 */
export function dragTextBox(box: TextBoxGeometry, pad: number, edges: HandleEdges, pointer: { x: number; y: number }): BoxDrag {
  let { left, width } = box;
  const right = box.left + box.width + pad;
  if (edges.fx < 0) {
    left = Math.min(pointer.x, right - pad - MIN_BOX_WIDTH);
    width = right - pad - left;
  } else if (edges.fx > 0) {
    width = Math.max(MIN_BOX_WIDTH, pointer.x - box.left - pad);
  }
  let minHeight: number | undefined;
  if (edges.fy < 0) minHeight = Math.max(0, box.top + box.height + pad - pointer.y - pad);
  else if (edges.fy > 0) minHeight = Math.max(0, pointer.y - box.top - pad);
  return { left, width, minHeight, keepBottom: edges.fy < 0 };
}
