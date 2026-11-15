// The Fabric object that draws and edits an Arrow. It is a plain FabricObject whose box is the arrow's
// bounds; it draws with `arrowGeometry` (the same geometry the Export renderer uses) and has just two
// controls, one on each end point, instead of the usual eight scale handles: resizing an arrow means
// moving an end. Dragging the line moves the whole arrow.
import { Control, FabricObject, Point } from "fabric";
import { arrowBounds, arrowGeometry, type ArrowAnnotation } from "../../core/annotations/arrow";

type End = "start" | "end";

const HANDLE_RADIUS = 6;

export class ArrowShape extends FabricObject {
  static override type = "ArrowShape";

  /** The Annotation as last applied: where it was when the box was at (boundsLeft, boundsTop). */
  private annotation!: ArrowAnnotation;
  private boundsLeft = 0;
  private boundsTop = 0;

  constructor(annotation: ArrowAnnotation) {
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
      // Hit-test on the drawn pixels (see targetFindTolerance on the canvas), not the whole box:
      // a diagonal arrow's box is mostly empty.
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
      // Fabric's matrix expects offsets in on-screen units (it divides the zoom back out), so scale ours.
      positionHandler: (_dim, finalMatrix, object) =>
        (object as ArrowShape)
          .endOffsetFromCenter(end)
          .scalarMultiply(object.getViewportTransform()[0])
          .transform(finalMatrix),
      actionHandler: (_event, transform, x, y) => {
        // x, y: the pointer in scene (Capture pixel) coordinates.
        (transform.target as ArrowShape).moveEnd(end, x, y);
        return true;
      },
    });
  }

  /** Make the shape show `annotation`, wherever it was. */
  setModel(annotation: ArrowAnnotation): void {
    const bounds = arrowBounds(annotation);
    this.annotation = annotation;
    this.boundsLeft = bounds.left;
    this.boundsTop = bounds.top;
    this.set({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height });
    this.setCoords();
    this.dirty = true;
  }

  /** The Annotation as it is on screen now, after the user moved the whole arrow or one end. */
  toModel(): ArrowAnnotation {
    const dx = this.left - this.boundsLeft;
    const dy = this.top - this.boundsTop;
    const a = this.annotation;
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  }

  moveEnd(end: End, x: number, y: number): void {
    const a = this.toModel();
    this.setModel(end === "start" ? { ...a, x1: x, y1: y } : { ...a, x2: x, y2: y });
  }

  /** Where an end point is, relative to the middle of the shape's box (what a Fabric control position is). */
  endOffsetFromCenter(end: End): Point {
    const a = this.toModel();
    const point = end === "start" ? { x: a.x1, y: a.y1 } : { x: a.x2, y: a.y2 };
    return new Point(point.x - (this.left + this.width / 2), point.y - (this.top + this.height / 2));
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const { line, heads } = arrowGeometry(this.annotation);
    // The context origin is the middle of the box; geometry is in Capture pixels.
    const ox = -this.boundsLeft - this.width / 2;
    const oy = -this.boundsTop - this.height / 2;
    const { color, width } = this.annotation.stroke;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(line.x1 + ox, line.y1 + oy);
    ctx.lineTo(line.x2 + ox, line.y2 + oy);
    ctx.stroke();
    for (const [tip, left, right] of heads) {
      ctx.beginPath();
      ctx.moveTo(tip!.x + ox, tip!.y + oy);
      ctx.lineTo(left!.x + ox, left!.y + oy);
      ctx.lineTo(right!.x + ox, right!.y + oy);
      ctx.closePath();
      ctx.fill();
    }
  }
}
