// The Blur on the canvas: a Rectangle-shaped Fabric object that paints nothing of its own. When it
// is drawn it pixelates what the canvas has drawn so far inside its box, so it sees the Capture and
// every Annotation beneath it (draw order is stacking order). The editor canvas and the Export's
// StaticCanvas both draw it this way, so what is seen is what is exported. The Capture is drawn
// first, as the canvas's background image, by both (ADR 0002: the Capture itself is never altered).
import { Rect } from "fabric";
import { pixelate } from "../pixelate";

export class BlurShape extends Rect {
  static override type = "BlurShape";
  /** Side of a pixel block, in Capture pixels. */
  blockSize = 12;

  override _render(ctx: CanvasRenderingContext2D): void {
    // The transform here maps the object's own space (origin at its centre) to canvas pixels, zoom
    // and device scale included; there is no rotation or skew (the handles never produce one).
    const m = ctx.getTransform();
    const scale = m.a;
    const width = this.width * scale;
    const height = this.height * scale;
    pixelate(ctx, { left: m.e - width / 2, top: m.f - height / 2, width, height }, this.blockSize * scale);
  }
}
