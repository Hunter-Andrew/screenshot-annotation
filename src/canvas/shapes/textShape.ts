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
import { isUnderlined, type VerticalAlign, valignOf } from "../../core/propertyGroups";

/** How much of the spare height (the box minus the lines) sits above the text for each vertical alignment. */
const SPARE_ABOVE: Record<VerticalAlign, number> = { top: 0, middle: 0.5, bottom: 1 };

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
  /** Where the text sits when the box is taller than its lines. Fabric's Textbox has no such thing: see `_getTopOffset`. */
  private valign: VerticalAlign = "top";
  /** Ctrl+U was pressed in this edit (it changes the Annotation's font, which Fabric does not know about). */
  private underlineToggled = false;

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
      // Ctrl+U alone changes no words, so Fabric reports nothing: tell the canvas the Annotation was modified.
      if (this.underlineToggled) {
        this.underlineToggled = false;
        if (this.canvas && this.text === (this as unknown as { _textBeforeEdit: string })._textBeforeEdit) this.canvas.fire("object:modified", { target: this });
      }
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
    this.valign = valignOf(font);
    this.set({
      left: annotation.x,
      top: annotation.y,
      width: annotation.width,
      fontSize: font.size,
      fontWeight: font.bold ? "bold" : "normal",
      fontStyle: font.italic ? "italic" : "normal",
      fill: font.color,
      textAlign: font.align ?? "left",
      underline: isUnderlined(font),
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

  /**
   * Where the first line starts, from the box's middle. Fabric draws text from the top of its box; a box taller than
   * its lines (a dragged-out area, a resized box) moves the text down by its spare height times the vertical
   * alignment. The lines, the caret, the selection, the underline and a click's position all start from here, so
   * they stay in step with one another.
   */
  override _getTopOffset(): number {
    const spare = Math.max(0, this.height - super.calcTextHeight());
    return super._getTopOffset() + spare * SPARE_ABOVE[this.valign];
  }

  /**
   * Wraps like Word: words wrap at spaces, and a word wider than the whole box is broken across lines by letter
   * (Fabric's own wrapping widens the box to the longest word instead, so it could not be narrowed). The width
   * the user chose is never exceeded unless one letter alone is wider than it.
   */
  override _wrapLine(lineIndex: number, desiredWidth: number, { wordsData }: Parameters<Textbox["_wrapLine"]>[2], reservedSpace = 0): string[][] {
    const maxWidth = Math.max(1, desiredWidth - reservedSpace);
    const lines: string[][] = [];
    let line: string[] = [];
    let lineWidth = 0;
    let offset = 0;
    let infixWidth = 0;
    let started = false;
    for (const { word, width } of wordsData[lineIndex] ?? []) {
      const wordStart = offset;
      offset += word.length;
      const fits = lineWidth + infixWidth + width <= maxWidth;
      if (started && fits) {
        line.push(" ", ...word);
        lineWidth += infixWidth + width;
      } else {
        if (started) lines.push(line);
        line = [];
        lineWidth = 0;
        if (width <= maxWidth) {
          line = [...word];
          lineWidth = width;
        } else {
          // Too long for any line: fill lines letter by letter; the last piece stays open for the words that follow.
          let previous: string | undefined;
          word.forEach((letter, i) => {
            const advance = this._getGraphemeBox(letter, lineIndex, wordStart + i, previous, true).kernedWidth;
            if (line.length > 0 && lineWidth + advance > maxWidth) {
              lines.push(line);
              line = [];
              lineWidth = 0;
              previous = undefined;
            }
            line.push(letter);
            lineWidth += advance;
            previous = letter;
          });
        }
      }
      started = true;
      infixWidth = this._measureWord([" "], lineIndex, offset);
      offset++;
    }
    if (started) lines.push(line);
    return lines;
  }

  /**
   * Whether the break after wrapped line `lineIndex` used up a character of the text: a hard line break and the space
   * a break at a space swallows do (1); a break inside a long word does not (0). Fabric assumes the first for every
   * line unless it splits by letter, and the caret and a click's position are counted with it.
   */
  override missingNewlineOffset(lineIndex: number): 0 | 1 {
    const here = this._styleMap?.[lineIndex];
    const next = this._styleMap?.[lineIndex + 1];
    if (!here || !next || next.line !== here.line) return 1;
    return next.offset - here.offset > (this._textLines[lineIndex]?.length ?? 0) ? 1 : 0;
  }

  /** Ctrl+U underlines the whole text, like the Style panel's U (Fabric has no such key). */
  override onKeyDown(e: KeyboardEvent): void {
    if (this.isEditing && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "u") {
      e.preventDefault();
      e.stopPropagation();
      this.underlineToggled = true;
      this.set({ underline: !this.underline });
      this.dirty = true;
      this.canvas?.requestRenderAll();
      return;
    }
    super.onKeyDown(e);
  }

  /** The Annotation as it is on screen now: its box and its words. */
  toModel(): TextAnnotation {
    const { minHeight: _previous, ...rest } = this.annotation;
    const minHeight = this.areaMinHeight ?? 0;
    // Absent when there never was a minimum; an explicit 0 when there was one and the box was resized without it
    // (a saved patch or an undo can then put the box back).
    const keep = minHeight > 0 ? { minHeight } : _previous !== undefined ? { minHeight: 0 } : {};
    // The underline is the one font setting that can change on the canvas (Ctrl+U while typing).
    const underline = !!this.underline;
    const font = isUnderlined(this.annotation.font) === underline ? this.annotation.font : { ...this.annotation.font, underline };
    return { ...rest, x: this.left, y: this.top, width: this.width, text: this.text, font, ...keep };
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
