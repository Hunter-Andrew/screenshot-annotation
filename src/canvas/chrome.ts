// Two helper objects of the editor canvas (ticket 37) that are not Annotations and never reach the Export:
//  - OutsideDim: draws everything outside the visible area very dark (the margin, and any cropped-out part
//    of the Capture with the Annotations on it), so it clearly is not part of the image. It is the canvas's
//    overlay, so the selection handles (drawn after it) stay bright.
//  - CropFrame: the Crop tool's eight handles on the visible area. Dragging one inward crops, outward expands.
import { FabricObject, Rect } from "fabric";
import type { Crop } from "../core/annotation";

/** Very dark, but not fully opaque: the outside is still dimly there, as the Crop's dimmed part always was. */
export const OUTSIDE_DIM = "rgba(6, 8, 12, 0.9)";

export class OutsideDim extends FabricObject {
  static override type = "OutsideDim";
  area: Crop = { x: 0, y: 0, width: 0, height: 0 };
  /** The part the canvas shows, in Capture pixels. */
  workspace: Crop = { x: 0, y: 0, width: 0, height: 0 };

  constructor() {
    super({ selectable: false, evented: false, objectCaching: false });
  }

  // Drawn directly in scene coordinates (the canvas applied its viewport transform): a ring between the
  // whole workspace and the area. Not subject to Fabric's off-screen test, which would skip an object with no size.
  override render(ctx: CanvasRenderingContext2D): void {
    const { x, y, width, height } = this.workspace;
    ctx.save();
    ctx.fillStyle = OUTSIDE_DIM;
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
      stroke: "#ffffff",
      strokeWidth: 2,
      strokeUniform: true,
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
    });
    this.setControlsVisibility({ mtr: false });
  }

  /** Only the handles take the pointer; a press inside the frame draws a fresh rectangle instead. */
  override containsPoint(): boolean {
    return false;
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
