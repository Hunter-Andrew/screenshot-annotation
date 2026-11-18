// The Fabric object that draws and edits a Pen stroke. Its box is the stroke's bounds; it draws with
// `smoothPath` (the same smoothing the Export renderer gets, because the renderer uses this shape too).
// A stroke can be selected and moved, not resized: it has no handles.
import { FabricObject } from "fabric";
import type { HighlightAnnotation } from "../../core/annotations/highlight";
import { penBounds, smoothPath, type PenAnnotation } from "../../core/annotations/pen";

/** The Highlighter is a Pen stroke with an opacity, so one shape draws both. */
type Stroked = PenAnnotation | HighlightAnnotation;

export class PenShape extends FabricObject {
  static override type = "PenShape";

  /** The Annotation as last applied: where it was when the box was at (boundsLeft, boundsTop). */
  private annotation!: Stroked;
  private boundsLeft = 0;
  private boundsTop = 0;

  constructor(annotation: Stroked) {
    super({
      originX: "left",
      originY: "top",
      fill: null,
      stroke: null,
      strokeWidth: 0,
      objectCaching: false,
      hasBorders: false,
      hasControls: false,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
      // Hit-test on the drawn pixels (see targetFindTolerance on the canvas): a stroke's box is mostly empty.
      perPixelTargetFind: true,
    });
    this.setModel(annotation);
  }

  setModel(annotation: Stroked): void {
    const bounds = penBounds(annotation);
    this.annotation = annotation;
    this.boundsLeft = bounds.left;
    this.boundsTop = bounds.top;
    this.set({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height });
    this.setCoords();
    this.dirty = true;
  }

  /** The Annotation as it is on screen now, after the user moved it. */
  toModel(): Stroked {
    const dx = this.left - this.boundsLeft;
    const dy = this.top - this.boundsTop;
    const a = this.annotation;
    return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    // The context origin is the middle of the box; points are in Capture pixels.
    const ox = -this.boundsLeft - this.width / 2;
    const oy = -this.boundsTop - this.height / 2;
    const { color, width } = this.annotation.stroke;

    ctx.globalAlpha *= "opacity" in this.annotation ? this.annotation.opacity.value : 1;
    // A highlighter multiplies with what is beneath it (like a marker: dark text stays dark, white
    // text on a dark ground comes out in the marker's colour). The context is put back for whatever is drawn next.
    ctx.save();
    try {
      if (this.annotation.type === "highlight") ctx.globalCompositeOperation = "multiply";
      this.paintStroke(ctx, ox, oy, color, width);
    } finally {
      ctx.restore();
    }
  }

  private paintStroke(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: string, width: number): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const [first, ...rest] = this.annotation.points;
    if (first && rest.every((p) => p.x === first.x && p.y === first.y)) {
      // A dot (a click): a zero-length line is not reliably drawn by every canvas, so fill a disc.
      ctx.fillStyle = color;
      ctx.arc(first.x + ox, first.y + oy, width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    for (const s of smoothPath(this.annotation.points)) {
      if (s.op === "M") ctx.moveTo(s.x + ox, s.y + oy);
      else if (s.op === "L") ctx.lineTo(s.x + ox, s.y + oy);
      else ctx.quadraticCurveTo(s.cx + ox, s.cy + oy, s.x + ox, s.y + oy);
    }
    ctx.stroke();
  }
}
