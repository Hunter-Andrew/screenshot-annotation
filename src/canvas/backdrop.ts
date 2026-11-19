// What is drawn first on the editor canvas and in the Export (ticket 37): the background fill over the
// visible area, then the Capture. It is one Fabric object (the canvas's background image) so the Capture
// stays the first drawn layer, and a Blur, which pixelates what has been drawn beneath it, sees both.
import { FabricImage } from "fabric";
import type { Crop } from "../core/annotation";

export class Backdrop extends FabricImage {
  static override type = "Backdrop";
  /** The visible area, in Capture pixels. */
  area: Crop;
  /** CSS colour of the fill outside the Capture; null for Transparent (nothing is drawn: alpha stays 0). */
  fill: string | null;

  constructor(element: HTMLImageElement | HTMLCanvasElement | ImageBitmap, area: Crop, fill: string | null) {
    // Not cached: the fill reaches beyond the picture's own box, which a cache canvas would cut off.
    super(element as HTMLImageElement, { originX: "left", originY: "top", objectCaching: false, selectable: false, evented: false });
    this.area = area;
    this.fill = fill;
  }

  // Fabric skips a background that is off screen; the fill must still be drawn when the area lies outside the Capture.
  override isOnScreen(): boolean {
    return true;
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    if (this.fill) {
      ctx.save();
      ctx.fillStyle = this.fill;
      // The context is centred on the picture, so the Capture's top-left corner is (-width / 2, -height / 2).
      ctx.fillRect(this.area.x - this.width / 2, this.area.y - this.height / 2, this.area.width, this.area.height);
      ctx.restore();
    }
    // Shrinking the Capture to the zoom: ask for the high-quality filter (it averages source pixels) instead of the default.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    super._render(ctx);
  }
}
