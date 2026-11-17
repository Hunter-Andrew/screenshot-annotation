// Rectangle and Ellipse on the canvas: stock Fabric objects (so Fabric draws them, in the editor and
// in the Export) kept in step with the model by `showBox`, and read back with `readBox`. The model's
// box is the middle of the outline; Fabric positions an object by its outer edge (stroke included),
// hence the half-stroke offsets.
//
// Resizing does not use Fabric's scale handles: they change a scale factor, and with a stroke that
// must stay the same thickness the anchor drifts by the stroke width. Instead the eight handles are
// custom controls (like the Arrow's end points) that set the box straight from the pointer, so the
// object never has a scale: the model's x, y, width and height are always what is on screen.
import { Control, Ellipse, type FabricObject, Point, Rect } from "fabric";
import type { BoxGeometry } from "../../core/annotations/box";
import { fillPaint } from "../../core/propertyGroups";

export const OPTIONS = {
  originX: "left",
  originY: "top",
  objectCaching: false,
  lockRotation: true,
  lockScalingX: true,
  lockScalingY: true,
  perPixelTargetFind: true,
  cornerStyle: "circle",
  cornerSize: 12,
  transparentCorners: false,
  cornerColor: "#ffffff",
  cornerStrokeColor: "#2f5bea",
  borderColor: "#2f5bea",
} as const;

/** The box each object shows right now (its position is the object's own left/top). */
const shown = new WeakMap<FabricObject, BoxGeometry>();

type Edge = -1 | 0 | 1;
interface Handle {
  key: string;
  /** Which edges move: -1 left/top, 1 right/bottom, 0 none. */
  x: Edge;
  y: Edge;
  cursor: string;
}
const HANDLES: Handle[] = [
  { key: "tl", x: -1, y: -1, cursor: "nwse-resize" },
  { key: "tr", x: 1, y: -1, cursor: "nesw-resize" },
  { key: "bl", x: -1, y: 1, cursor: "nesw-resize" },
  { key: "br", x: 1, y: 1, cursor: "nwse-resize" },
  { key: "ml", x: -1, y: 0, cursor: "ew-resize" },
  { key: "mr", x: 1, y: 0, cursor: "ew-resize" },
  { key: "mt", x: 0, y: -1, cursor: "ns-resize" },
  { key: "mb", x: 0, y: 1, cursor: "ns-resize" },
];

const MIN_SIDE = 1;

/** The edges after dragging a handle to `pointer`, keeping the far edge (`anchor`) where it was. */
function dragEdge(moves: Edge, anchor: number, pointer: number, current: [number, number]): [number, number] {
  if (moves === 0) return current;
  const far = Math.abs(pointer - anchor) < MIN_SIDE ? anchor + (pointer < anchor ? -MIN_SIDE : MIN_SIDE) : pointer;
  return [Math.min(anchor, far), Math.max(anchor, far)];
}

/**
 * How the handles resize an object. Default: the box follows the pointer, and dragging past the
 * opposite edge flips it (Rectangle, Ellipse, Blur). `fixed` (a pasted image, ticket 38): no flipping,
 * and the corners keep the aspect ratio unless Shift is held.
 */
export interface ResizeRules {
  fixed?: boolean;
}

/** The edges after dragging a handle that may not flip: the dragged edge stops one pixel short of the fixed one. */
function dragEdgeNoFlip(moves: Edge, anchor: number, pointer: number, current: [number, number]): [number, number] {
  if (moves === 0) return current;
  return moves === -1 ? [Math.min(pointer, anchor - MIN_SIDE), anchor] : [anchor, Math.max(pointer, anchor + MIN_SIDE)];
}

function controls(rules: ResizeRules): Record<string, Control> {
  const result: Record<string, Control> = {};
  for (const handle of HANDLES) {
    result[handle.key] = new Control({
      x: handle.x / 2,
      y: handle.y / 2,
      cursorStyle: handle.cursor,
      actionName: "resizing",
      // Fabric's matrix expects offsets in on-screen units (it divides the zoom back out).
      positionHandler: (_dim, finalMatrix, object) => {
        const box = shown.get(object as FabricObject)!;
        const s = box.stroke.width;
        return new Point((handle.x * (box.width + s)) / 2, (handle.y * (box.height + s)) / 2)
          .scalarMultiply(object.getViewportTransform()[0])
          .transform(finalMatrix);
      },
      actionHandler: (event, transform, px, py) => {
        const object = transform.target as FabricObject;
        const box = shown.get(object)!;
        const left = object.left + box.stroke.width / 2;
        const top = object.top + box.stroke.width / 2;
        // The edge that does not move is fixed when the gesture starts, so dragging past it flips the box.
        const t = transform as unknown as { anchor?: { x: number; y: number } };
        t.anchor ??= {
          x: handle.x === -1 ? left + box.width : left,
          y: handle.y === -1 ? top + box.height : top,
        };
        if (rules.fixed) {
          let [x1, x2] = dragEdgeNoFlip(handle.x, t.anchor.x, px, [left, left + box.width]);
          let [y1, y2] = dragEdgeNoFlip(handle.y, t.anchor.y, py, [top, top + box.height]);
          const corner = handle.x !== 0 && handle.y !== 0;
          if (corner && !(event as MouseEvent).shiftKey) {
            // The shape the gesture started with: the larger of what the pointer asks for on each axis wins.
            const t2 = transform as unknown as { ratio?: number };
            t2.ratio ??= box.width / box.height;
            const width = Math.max(x2 - x1, (y2 - y1) * t2.ratio);
            const height = width / t2.ratio;
            if (handle.x === -1) x1 = x2 - width;
            else x2 = x1 + width;
            if (handle.y === -1) y1 = y2 - height;
            else y2 = y1 + height;
          }
          showBox(object, { ...box, x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
          return true;
        }
        const [x1, x2] = dragEdge(handle.x, t.anchor.x, px, [left, left + box.width]);
        const [y1, y2] = dragEdge(handle.y, t.anchor.y, py, [top, top + box.height]);
        showBox(object, { ...box, x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
        return true;
      },
    });
  }
  return result;
}

export function paint(box: BoxGeometry) {
  return {
    left: box.x - box.stroke.width / 2,
    top: box.y - box.stroke.width / 2,
    stroke: box.stroke.color,
    strokeWidth: box.stroke.width,
    fill: fillPaint(box.fill),
  };
}

export function finish<T extends FabricObject>(object: T, box: BoxGeometry, rules: ResizeRules = {}): T {
  shown.set(object, box);
  object.controls = controls(rules);
  return object;
}

export function createRect(box: BoxGeometry): FabricObject {
  return finish(new Rect({ ...OPTIONS, ...paint(box), width: box.width, height: box.height }), box);
}

export function createEllipse(box: BoxGeometry): FabricObject {
  return finish(new Ellipse({ ...OPTIONS, ...paint(box), rx: box.width / 2, ry: box.height / 2 }), box);
}

/** Make `object` show `box` (after a restyle, a resize, or any model change). */
export function showBox(object: FabricObject, box: BoxGeometry): void {
  shown.set(object, box);
  const size =
    object instanceof Ellipse ? { rx: box.width / 2, ry: box.height / 2 } : { width: box.width, height: box.height };
  object.set({ ...paint(box), ...size });
  object.setCoords();
  object.dirty = true;
}

/** The geometry of `object` as the user left it (moved or resized). */
export function readBox(object: FabricObject): { x: number; y: number; width: number; height: number } {
  const box = shown.get(object)!;
  const half = box.stroke.width / 2;
  return { x: object.left + half, y: object.top + half, width: box.width, height: box.height };
}
