// Two helper objects of the editor canvas (ticket 37) that are not Annotations and never reach the Export:
//  - OutsideDim: dims everything the canvas draws outside the visible area (any cropped-out part of the Capture
//    with the Annotations on it) by the Outside-canvas darkness setting, or, when the image does not show its
//    outside, erases it so only the dark fill of the well shows there. It is the canvas's overlay, so the
//    selection handles (drawn after it) stay bright. The margin itself is the well's own dark fill (editor.css),
//    which this never paints over: it only touches pixels the canvas has drawn.
//  - CropFrame: the Crop tool's eight handles on the visible area. Dragging one inward crops, outward expands.
//    It has no outline of its own: nothing is drawn around the area at rest.
import { FabricObject, Rect } from "fabric";
import type { Crop } from "../core/annotation";

/** The dark that the outside is dimmed with (also the tint of the well's own fill, see editor.css). */
export const OUTSIDE_DIM_RGB = "6, 8, 12";

export class OutsideDim extends FabricObject {
  static override type = "OutsideDim";
  area: Crop = { x: 0, y: 0, width: 0, height: 0 };
  /** The part the canvas shows, in Capture pixels. */
  workspace: Crop = { x: 0, y: 0, width: 0, height: 0 };
  /** How dark the outside is, 0 to 95 percent. */
  darkness = 60;
  /** False: what the canvas drew outside the area is erased instead of dimmed. */
  showOutside = true;

  constructor() {
    super({ selectable: false, evented: false, objectCaching: false });
  }

  // Drawn directly in scene coordinates (the canvas applied its viewport transform): a ring between the
  // whole workspace and the area. Not subject to Fabric's off-screen test, which would skip an object with no size.
  override render(ctx: CanvasRenderingContext2D): void {
    const { x, y, width, height } = this.workspace;
    ctx.save();
    if (this.showOutside) {
      // Only over pixels that are there (the Capture and Annotations), so the margin stays the well's fill.
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = `rgba(${OUTSIDE_DIM_RGB}, ${this.darkness / 100})`;
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
    }
    ctx.beginPath();
    ctx.rect(x - 2, y - 2, width + 4, height + 4);
    ctx.rect(this.area.x, this.area.y, this.area.width, this.area.height);
    ctx.fill("evenodd");
    ctx.restore();
  }
}

export class CropFrame extends Rect {
  static override type = "CropFrame";

  constructor(area: Crop) {
    super({
      ...area,
      originX: "left",
      originY: "top",
      fill: "transparent",
      // No outline: only the eight handles show.
      stroke: null,
      strokeWidth: 0,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingFlip: true,
      hasBorders: false,
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerStrokeColor: "#2f5bea",
      cornerStyle: "rect",
      cornerSize: 10,
      touchCornerSize: 20,
      objectCaching: false,
      // Only the handles take the pointer (the fill is transparent and there is no outline): a press inside the
      // frame is not on it, and draws a fresh rectangle instead.
      perPixelTargetFind: true,
    });
    this.setControlsVisibility({ mtr: false });
    // The area is never kept in proportion: Fabric's corner handles scale both sides together (uniform scaling, or
    // with Shift), so each corner gets its own action instead: the corner follows the pointer in both axes at once,
    // the opposite corner stays where it was. (A pasted image keeps Fabric's corners: proportional unless Shift.)
    const opposite = { tl: [1, 1], tr: [0, 1], bl: [1, 0], br: [0, 0] } as const;
    for (const corner of ["tl", "tr", "bl", "br"] as const) {
      this.controls[corner]!.actionHandler = (_event, transform, x, y) => {
        const frame = transform.target as CropFrame;
        const { left, top, scaleX, scaleY } = transform.original;
        const [fromRight, fromBottom] = opposite[corner];
        const anchorX = left + fromRight * frame.width * scaleX;
        const anchorY = top + fromBottom * frame.height * scaleY;
        // Crossing the anchor turns the rectangle over (it never goes below a pixel).
        const width = Math.max(1, Math.abs(x - anchorX));
        const height = Math.max(1, Math.abs(y - anchorY));
        frame.set({ left: Math.min(x, anchorX), top: Math.min(y, anchorY), scaleX: width / frame.width, scaleY: height / frame.height });
        return true;
      };
    }
  }

  /** The frame as it was dragged, in whole Capture pixels. */
  dragged(): Crop {
    const x1 = Math.round(this.left);
    const y1 = Math.round(this.top);
    return {
      x: x1,
      y: y1,
      width: Math.round(this.left + this.width * this.scaleX) - x1,
      height: Math.round(this.top + this.height * this.scaleY) - y1,
    };
  }

  /** Back to exactly `area` (a new visible area, or a drag that was refused). */
  place(area: Crop): void {
    this.set({ left: area.x, top: area.y, width: area.width, height: area.height, scaleX: 1, scaleY: 1 });
    this.setCoords();
  }
}
