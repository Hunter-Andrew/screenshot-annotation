// A pasted image on the canvas (ticket 38): a Rectangle-shaped Fabric object that draws a decoded
// bitmap in its box. It is an ordinary object in the stacking order, drawn into the same canvas as
// everything else, so a Blur above it pixelates it exactly as it is seen (opacity included), on the
// editor canvas and in the Export's StaticCanvas alike.
//
// The bitmap must be decoded before the canvas renders (the Export renders once, synchronously); until
// it is, the box draws nothing. The opacity applies to the picture only; the border is drawn at full
// strength, inside the edge, so it never changes the footprint or the handles.
import { Rect } from "fabric";
import type { Border } from "../../core/propertyGroups";

export class ImageShape extends Rect {
  static override type = "ImageShape";
  /** The `imageId` this object shows. */
  imageId = "";
  /** The decoded picture, once there is one. */
  bitmap: CanvasImageSource | null = null;
  /** 0.1-1: the picture's see-through-ness (not the border's). */
  imageOpacity = 1;
  border: Border = { enabled: false, color: "#000000", width: 1 };

  override _render(ctx: CanvasRenderingContext2D): void {
    // The origin is the object's centre; the transform carries zoom and device scale.
    const { width, height } = this;
    if (this.bitmap) {
      ctx.save();
      ctx.globalAlpha *= this.imageOpacity;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.bitmap, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
    if (this.border.enabled) {
      // Inside the edge: the stroke's outer side is the box's edge.
      const line = Math.min(this.border.width, width / 2, height / 2);
      ctx.save();
      ctx.strokeStyle = this.border.color;
      ctx.lineWidth = line;
      ctx.strokeRect(-width / 2 + line / 2, -height / 2 + line / 2, width - line, height - line);
      ctx.restore();
    }
  }
}
