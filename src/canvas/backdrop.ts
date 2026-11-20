// What is drawn first on the editor canvas and in the Export (ticket 37): the background fill over the
// visible area, then the Capture. It is one Fabric object (the canvas's background image) so the Capture
// stays the first drawn layer, and a Blur, which pixelates what has been drawn beneath it, sees both.
import { FabricImage } from "fabric";
import type { Crop } from "../core/annotation";
import { sharpDownscale } from "./lanczos";

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
    // Shrinking the Capture to the zoom: the browser's own filter is soft, so draw a Lanczos-shrunk copy that is
    // one device pixel per pixel (the canvas sits on whole device pixels, see applyView). Otherwise the default path.
    const shrunk = this.shrunkFor(ctx);
    if (shrunk) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(shrunk, -this.width / 2, -this.height / 2, this.width, this.height);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    super._render(ctx);
  }

  /** The Capture shrunk to how big it is on this context's pixels, when it is drawn smaller than it is. */
  private shrunkFor(ctx: CanvasRenderingContext2D): HTMLCanvasElement | null {
    if (typeof ctx.getTransform !== "function") return null;
    const m = ctx.getTransform();
    // Only a plain scale (no rotation or skew) smaller than 1:1.
    if (m.b !== 0 || m.c !== 0 || m.a <= 0 || m.d <= 0 || (m.a >= 1 && m.d >= 1)) return null;
    const dw = Math.round(this.width * m.a);
    const dh = Math.round(this.height * m.d);
    return sharpDownscale(this.getElement() as HTMLImageElement, this.width, this.height, dw, dh);
  }
}
