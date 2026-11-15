// The Fabric object that draws and edits a Line: like an Arrow (see arrowShape.ts) it is a plain
// FabricObject whose box is the line's bounds, with one control on each end point; dragging the line
// moves it. It draws the same way in the editor and in the Export.
import { Control, FabricObject, Point } from "fabric";
import { lineBounds, type LineAnnotation } from "../../core/annotations/line";

type End = "start" | "end";

const HANDLE_RADIUS = 6;

export class LineShape extends FabricObject {
  static override type = "LineShape";

  private annotation!: LineAnnotation;
  private boundsLeft = 0;
  private boundsTop = 0;

  constructor(annotation: LineAnnotation) {
    super({
      originX: "left",
      originY: "top",
      fill: null,
      stroke: null,
      strokeWidth: 0,
      objectCaching: false,
      hasBorders: false,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
      perPixelTargetFind: true,
      cornerStyle: "circle",
      cornerSize: HANDLE_RADIUS * 2,
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerStrokeColor: "#2f5bea",
    });
    this.controls = { start: this.endControl("start"), end: this.endControl("end") };
    this.setModel(annotation);
  }

  private endControl(end: End): Control {
    return new Control({
      cursorStyle: "crosshair",
      actionName: "modifyEndpoint",
      positionHandler: (_dim, finalMatrix, object) =>
        (object as LineShape)
          .endOffsetFromCenter(end)
          .scalarMultiply(object.getViewportTransform()[0])
          .transform(finalMatrix),
      actionHandler: (_event, transform, x, y) => {
        (transform.target as LineShape).moveEnd(end, x, y);
        return true;
      },
    });
  }

  setModel(annotation: LineAnnotation): void {
    const bounds = lineBounds(annotation);
    this.annotation = annotation;
    this.boundsLeft = bounds.left;
    this.boundsTop = bounds.top;
    this.set({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height });
    this.setCoords();
    this.dirty = true;
  }

  /** The Annotation as it is on screen now, after the user moved the whole line or one end. */
  toModel(): LineAnnotation {
    const dx = this.left - this.boundsLeft;
    const dy = this.top - this.boundsTop;
    const a = this.annotation;
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  }

  moveEnd(end: End, x: number, y: number): void {
    const a = this.toModel();
    this.setModel(end === "start" ? { ...a, x1: x, y1: y } : { ...a, x2: x, y2: y });
  }

  endOffsetFromCenter(end: End): Point {
    const a = this.toModel();
    const point = end === "start" ? { x: a.x1, y: a.y1 } : { x: a.x2, y: a.y2 };
    return new Point(point.x - (this.left + this.width / 2), point.y - (this.top + this.height / 2));
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    // The context origin is the middle of the box; geometry is in Capture pixels.
    const ox = -this.boundsLeft - this.width / 2;
    const oy = -this.boundsTop - this.height / 2;
    const { x1, y1, x2, y2, stroke } = this.annotation;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(x1 + ox, y1 + oy);
    ctx.lineTo(x2 + ox, y2 + oy);
    ctx.stroke();
  }
}
