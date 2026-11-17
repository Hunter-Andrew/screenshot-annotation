// The Fabric object for a Callout: a Text box (typing, wrapping and the eight box handles come from
// TextShape) drawn inside a speech box with a pointer tail. The tail's tip has its own handle.
// The speech box and tail are painted by `_renderBackground`, before the letters, so Export draws
// them exactly as the screen does. `padding` makes the selection border and handles hug the speech box.
import { Control, Point } from "fabric";
import type { CalloutAnnotation } from "../../core/annotations/callout";
import { bubbleBox, CALLOUT_PAD, defaultTip, outlinePath, tailTo } from "../../core/annotations/calloutGeometry";
import { fillPaint } from "../../core/propertyGroups";
import type { HandleName } from "../../core/annotations/textBox";
import { TextShape } from "./textShape";

export class CalloutShape extends TextShape {
  static override type = "CalloutShape";

  declare private callout: CalloutAnnotation;
  /** Tail tip as an offset from the text box's top-left corner; null until the tip is first needed. */
  declare private tip: { x: number; y: number } | null;

  constructor(annotation: CalloutAnnotation) {
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

  override isControlVisible(control: string): boolean {
    if (control === "tail") return this.callout?.tail.enabled !== false && !this.isEditing;
    return super.isControlVisible(control);
  }

  /** Make the shape show `annotation` (a restyle, an undo...); the text part goes through TextShape. */
  setCallout(annotation: CalloutAnnotation): void {
    this.callout = annotation;
    this.tip = annotation.tip ? { ...annotation.tip } : null;
    // Fabric's own stroke belongs to the letters (the text outline); the speech box is drawn in `_renderBackground`.
    this.setModel({ ...annotation, type: "text" });
  }

  /** The Annotation as it is on screen now: its box, words and tail tip. */
  toCallout(): CalloutAnnotation {
    const { type: _type, ...text } = this.toModel();
    const { tip: _old, runs: _runs, ...kept } = this.callout;
    return { ...kept, ...text, type: "callout", ...(this.tip ? { tip: { x: this.tip.x, y: this.tip.y } } : {}) };
  }

  override _renderBackground(ctx: CanvasRenderingContext2D): void {
    const callout = this.callout;
    if (!callout) return;
    const box = bubbleBox({ left: -this.width / 2, top: -this.height / 2, width: this.width, height: this.height });
    const tip = this.tipOffset();
    const tail = callout.tail.enabled
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
