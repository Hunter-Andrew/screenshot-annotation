// The Fabric object that draws and edits a Text Annotation: a Fabric `Textbox`, the one object that
// both edits text in place and wraps it to a width the user can drag. The Export draws this same
// object (renderFinished), so the burned-in text is exactly what was on screen.
//
// Look (from the Konva-vs-Fabric prototype): the outline is Fabric's stroke, painted FIRST (so the
// letter fill covers the inner half) with a DOUBLED stroke width (so the visible outline is the full
// width the user chose, all of it outside the letters). Round joins keep sharp letters from growing spikes.
//
// Behavior: only the two horizontal handles exist and they change the wrap width, never the font size.
// A click selects, a double-click edits in place (Fabric's default of editing on the second click is
// switched off), and leaving the box (a click elsewhere, Esc, another control) ends the edit.
import { controlsUtils, Textbox } from "fabric";
import { FONT_FAMILY, type TextAnnotation } from "../../core/annotations/text";

export class TextShape extends Textbox {
  static override type = "TextShape";

  /** The Annotation as last applied: what an edit that ends with no words falls back to. */
  private annotation!: TextAnnotation;

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
    // Horizontal handles only (they change `width`, leaving the font size alone).
    const { ml, mr } = controlsUtils.createResizeControls();
    for (const control of [ml, mr]) {
      const resize = control.actionHandler;
      // Fabric keeps the box's vertical middle fixed while it resizes; rewrapping changes the height,
      // so that would make the box's top jump. Keep the top where it was.
      control.actionHandler = (event, transform, x, y) => {
        const top = transform.target.top;
        const changed = resize(event, transform, x, y);
        transform.target.set({ top });
        return changed;
      };
    }
    this.controls = { ml, mr };
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
    this.set({
      left: annotation.x,
      top: annotation.y,
      width: annotation.width,
      fontSize: font.size,
      fontWeight: font.bold ? "bold" : "normal",
      fontStyle: font.italic ? "italic" : "normal",
      fill: font.color,
      stroke: outlined ? textOutline.color : null,
      // Doubled: the stroke is centred on the letter edge and the fill covers its inner half.
      strokeWidth: outlined ? textOutline.width * 2 : 0,
    });
    if (!this.isEditing && this.text !== annotation.text) this.set({ text: annotation.text });
    this.setCoords();
    this.dirty = true;
  }

  /** The Annotation as it is on screen now: its box and its words. */
  toModel(): TextAnnotation {
    return { ...this.annotation, x: this.left, y: this.top, width: this.width, text: this.text };
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
