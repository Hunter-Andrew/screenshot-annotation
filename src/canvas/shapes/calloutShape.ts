// The Fabric object for a Callout or a Text box: a text box (typing, wrapping and the eight box handles come from
// TextShape) drawn inside a speech box, with a pointer tail for a Callout and none for a Text box. The tail's tip has
// its own handle.
// The speech box and tail are painted by `_renderBackground`, before the letters, so Export draws
// them exactly as the screen does. `padding` makes the selection border and handles hug the speech box.
import { Control, Point } from "fabric";
import type { CalloutAnnotation } from "../../core/annotations/callout";
import type { TextBoxAnnotation } from "../../core/annotations/textBoxTool";
import { bubbleBox, CALLOUT_PAD, defaultTip, outlinePath, tailTo } from "../../core/annotations/calloutGeometry";
import { fillPaint } from "../../core/propertyGroups";
import type { HandleName } from "../../core/annotations/textBox";
import { TextShape } from "./textShape";

/** What the shape draws: a Callout, or the tailless Text box. */
type Boxed = CalloutAnnotation | TextBoxAnnotation;

export class CalloutShape extends TextShape {
  static override type = "CalloutShape";

  declare private callout: Boxed;
  /** Tail tip as an offset from the text box's top-left corner; null until the tip is first needed. */
  declare private tip: { x: number; y: number } | null;

  constructor(annotation: Boxed) {
    super({ ...annotation, type: "text" });
    this.keepsEmptyText = true;
    this.padding = CALLOUT_PAD;
    this.controls = {
      ...this.controls,
      tail: new Control({
        x: 0,
        y: 0,
        cursorStyle: "move",
        actionName: "tail",
        positionHandler: (_dim, _matrix, object) => {
          const shape = object as CalloutShape;
          const tip = shape.tipOffset();
          const scene = new Point(shape.left + tip.x, shape.top + tip.y);
          const transform = shape.canvas?.viewportTransform;
          return transform ? scene.transform(transform) : scene;
        },
        actionHandler: (_event, transform, x, y) => {
          const shape = transform.target as CalloutShape;
          shape.tip = { x: x - shape.left, y: y - shape.top };
          shape.dirty = true;
          return true;
        },
      }),
    };
    this.setCallout(annotation);
  }

  /** While the whole shape is dragged: where its tail's tip is on the canvas, and its offset when the drag began. */
  private moveStart: { spot: { x: number; y: number }; offset: { x: number; y: number } } | null = null;

  /** A drag of the whole shape is about to start: remember where its tail points. A Text box has no tail, so nothing. */
  beginMove(): void {
    if (!this.hasTail()) return;
    const offset = this.tipOffset();
    this.moveStart = { spot: { x: this.left + offset.x, y: this.top + offset.y }, offset };
  }

  /**
   * The shape is being dragged. By default the tail's tip stays where it was on the canvas, so the box moves and the
   * tail stretches to it; with `tailFollows` (Shift held) the tip moves along with the box. Either way the stored tip
   * is an offset from the box's corner, so it is re-aimed here, on every step of the drag.
   */
  moveTip(tailFollows: boolean): void {
    const start = this.moveStart;
    if (!start) return;
    this.tip = tailFollows ? { ...start.offset } : { x: start.spot.x - this.left, y: start.spot.y - this.top };
    this.dirty = true;
  }

  /** The drag is over. */
  endMove(): void {
    this.moveStart = null;
  }

  /** The tip as an offset from the text box's top-left corner (the default when the user has not set one). */
  private tipOffset(): { x: number; y: number } {
    return this.tip ?? defaultTip({ width: this.width, height: this.height });
  }

  /**
   * The tail's tip must not move when the box is resized, whichever handle does it: the tip is stored relative to
   * the box's top-left corner, so every resize re-aims it from the new corner. A tip that was still the default
   * (never placed) is frozen here, on the first resize, where it was. Moving the whole callout keeps the offset.
   */
  override dragHandle(name: HandleName, x: number, y: number): boolean {
    const before = this.tipOffset();
    const spot = { x: this.left + before.x, y: this.top + before.y };
    const changed = super.dragHandle(name, x, y);
    if (changed) this.tip = { x: spot.x - this.left, y: spot.y - this.top };
    return changed;
  }

  /** A Callout has a tail (an older one saved with the tail switched off has none); a Text box never does. */
  private hasTail(): boolean {
    const callout = this.callout;
    return callout?.type === "callout" && callout.tail?.enabled !== false;
  }

  override isControlVisible(control: string): boolean {
    if (control === "tail") return this.hasTail() && !this.isEditing;
    return super.isControlVisible(control);
  }

  /** Make the shape show `annotation` (a restyle, an undo...); the text part goes through TextShape. */
  setCallout(annotation: Boxed): void {
    this.callout = annotation;
    this.tip = annotation.type === "callout" && annotation.tip ? { ...annotation.tip } : null;
    // Fabric's own stroke belongs to the letters (the text outline); the speech box is drawn in `_renderBackground`.
    this.setModel({ ...annotation, type: "text" });
  }

  /** The Annotation as it is on screen now: its box, words and tail tip. */
  toCallout(): Boxed {
    const { type: _type, ...text } = this.toModel();
    const { runs: _runs, ...kept } = this.callout;
    if (this.callout.type === "textbox") return { ...(kept as TextBoxAnnotation), ...text, type: "textbox" };
    const { tip: _old, ...callout } = kept as CalloutAnnotation;
    return { ...callout, ...text, type: "callout", ...(this.tip ? { tip: { x: this.tip.x, y: this.tip.y } } : {}) };
  }

  override _renderBackground(ctx: CanvasRenderingContext2D): void {
    const callout = this.callout;
    if (!callout) return;
    const box = bubbleBox({ left: -this.width / 2, top: -this.height / 2, width: this.width, height: this.height });
    const tip = this.tipOffset();
    const tail = this.hasTail()
      ? tailTo(box, { x: -this.width / 2 + tip.x, y: -this.height / 2 + tip.y })
      : null;
    ctx.save();
    ctx.beginPath();
    for (const s of outlinePath(box, tail)) {
      if (s.op === "M") ctx.moveTo(s.x, s.y);
      else if (s.op === "L") ctx.lineTo(s.x, s.y);
      else ctx.arcTo(s.x1, s.y1, s.x2, s.y2, s.r);
    }
    ctx.closePath();
    const paint = fillPaint(callout.fill);
    if (paint) {
      ctx.fillStyle = paint;
      ctx.fill();
    }
    ctx.strokeStyle = callout.stroke.color;
    ctx.lineWidth = callout.stroke.width;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
}
