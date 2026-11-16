// The Fabric object that draws and edits a Text Annotation: a Fabric `Textbox`, the one object that
// both edits text in place and wraps it to a width the user can drag. The Export draws this same
// object (renderFinished), so the burned-in text is exactly what was on screen.
//
// Look (from the Konva-vs-Fabric prototype): the outline is Fabric's stroke, painted FIRST (so the
// letter fill covers the inner half) with a DOUBLED stroke width (so the visible outline is the full
// width the user chose, all of it outside the letters). Round joins keep sharp letters from growing spikes.
//
// Behavior: all eight handles resize and move the BOX (wrap width, minimum height, and the left or top
// edge), never the font size (src/core/annotations/textBox.ts).
// A click selects, a double-click edits in place (Fabric's default of editing on the second click is
// switched off), and leaving the box (a click elsewhere, Esc, another control) ends the edit.
import { controlsUtils, Textbox } from "fabric";
import { FONT_FAMILY, type TextAnnotation } from "../../core/annotations/text";
import { dragTextBox, HANDLES, type HandleName } from "../../core/annotations/textBox";

const CURSORS: Record<HandleName, string> = {
  tl: "nwse-resize",
  br: "nwse-resize",
  tr: "nesw-resize",
  bl: "nesw-resize",
  ml: "ew-resize",
  mr: "ew-resize",
  mt: "ns-resize",
  mb: "ns-resize",
};

export class TextShape extends Textbox {
  static override type = "TextShape";

  /** The Annotation as last applied: what an edit that ends with no words falls back to. */
  private annotation!: TextAnnotation;
  /** The lowest height of the box (the area the user dragged out); read while Fabric lays the text out. */
  declare private areaMinHeight?: number;

  constructor(annotation: TextAnnotation) {
    super(annotation.text, {
      left: annotation.x,
      top: annotation.y,
      width: annotation.width,
      originX: "left",
      originY: "top",
      fontFamily: FONT_FAMILY,
      paintFirst: "stroke",
      strokeLineJoin: "round",
      strokeLineCap: "round",
      // A fixed outline of the glyphs: scaling is replaced by wrap-width handles below.
      lockScalingY: true,
      lockRotation: true,
      lockScalingFlip: true,
      objectCaching: false,
      hasBorders: true,
      borderColor: "#2f5bea",
      cornerStyle: "circle",
      cornerSize: 12,
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerStrokeColor: "#2f5bea",
      splitByGrapheme: false,
    });
    // All eight handles change the box, never the font size. (Fabric's own scaling handlers would scale the
    // letters, so each handle gets its own action; there is no rotation handle.)
    const defaults = controlsUtils.createObjectDefaultControls();
    this.controls = {};
    for (const name of Object.keys(HANDLES) as HandleName[]) {
      const control = defaults[name];
      control.actionHandler = (_event, transform, x, y) => (transform.target as TextShape).dragHandle(name, x, y);
      control.cursorStyleHandler = () => CURSORS[name];
      control.actionName = "resizing";
      this.controls[name] = control;
    }
    this.setModel(annotation);
    // A double-click starts editing (Fabric's own trigger, a second single click, is replaced below).
    this.on("mousedblclick", () => {
      if (!this.isEditing && this.canvas) this.beginEditing();
    });
    this.on("editing:exited", () => {
      // An edit that leaves no words keeps the previous ones (there is no empty Text Annotation).
      if (this.annotation.text.trim() !== "" && this.text.trim() === "") this.set({ text: this.annotation.text });
    });
  }

  /** Make the shape show `annotation`, wherever it was. A text being typed keeps what is typed. */
  setModel(annotation: TextAnnotation): void {
    this.annotation = annotation;
    const { font, textOutline } = annotation;
    const outlined = textOutline.enabled && textOutline.width > 0;
    this.areaMinHeight = annotation.minHeight ?? 0;
    this.set({
      left: annotation.x,
      top: annotation.y,
      width: annotation.width,
      fontSize: font.size,
      fontWeight: font.bold ? "bold" : "normal",
      fontStyle: font.italic ? "italic" : "normal",
      fill: font.color,
      textAlign: font.align ?? "left",
      stroke: outlined ? textOutline.color : null,
      // Doubled: the stroke is centred on the letter edge and the fill covers its inner half.
      strokeWidth: outlined ? textOutline.width * 2 : 0,
    });
    if (!this.isEditing && this.text !== annotation.text) this.set({ text: annotation.text });
    this.initDimensions(); // the minimum height may have changed
    this.setCoords();
    this.dirty = true;
  }

  /** The box is as tall as its lines, but never shorter than the area it was dragged out as. */
  override calcTextHeight(): number {
    return Math.max(super.calcTextHeight(), this.areaMinHeight ?? 0);
  }

  /** The Annotation as it is on screen now: its box and its words. */
  toModel(): TextAnnotation {
    const { minHeight: _previous, ...rest } = this.annotation;
    const minHeight = this.areaMinHeight ?? 0;
    // Absent when there never was a minimum; an explicit 0 when there was one and the box was resized without it
    // (a saved patch or an undo can then put the box back).
    const keep = minHeight > 0 ? { minHeight } : _previous !== undefined ? { minHeight: 0 } : {};
    return { ...rest, x: this.left, y: this.top, width: this.width, text: this.text, ...keep };
  }

  /**
   * A handle is dragged to the scene point (x, y): move the edges that handle owns and re-wrap. The
   * opposite edges stay put. Returns whether the box changed.
   */
  dragHandle(name: HandleName, x: number, y: number): boolean {
    const pad = this.strokeWidth || 0;
    const before = { left: this.left, top: this.top, width: this.width, height: this.height };
    const drag = dragTextBox(before, pad, HANDLES[name], { x, y });
    if (drag.minHeight !== undefined) this.areaMinHeight = drag.minHeight;
    this.set({ left: drag.left, width: drag.width });
    this.initDimensions(); // re-wrap at the new width; the height follows from the lines and the minimum
    // Dragging the top edge keeps the bottom edge where it was, whatever height the lines now need.
    if (drag.keepBottom) this.set({ top: before.top + before.height - this.height });
    this.setCoords();
    return before.left !== this.left || before.top !== this.top || before.width !== this.width || before.height !== this.height;
  }

  /** Start typing in place (select all of a new box's nothing, or put the caret at the end). */
  beginEditing(): void {
    this.enterEditing();
    this.selectionStart = this.selectionEnd = this.text.length;
    this.hiddenTextarea?.focus();
  }

  /** Fabric's default is to start editing on the second click of a selected text; here only a double-click does. */
  override mouseUpHandler(info: Parameters<Textbox["mouseUpHandler"]>[0]): void {
    if (this.isEditing) super.mouseUpHandler(info);
  }

  override initHiddenTextarea(): void {
    super.initHiddenTextarea();
    // Clicking away to another control (a Style panel field, a button) ends the edit like clicking the canvas does.
    this.hiddenTextarea?.addEventListener("blur", () => {
      if (this.isEditing) this.exitEditing();
    });
  }
}
