// Test-only: a CanvasKit with no canvas, for the editor's jsdom tests (jsdom has no 2D canvas, and
// Fabric needs one). It records what the editor tells the canvas, and lets a test play the part of
// the user's gestures. The real canvas is exercised by the Playwright tests in e2e/.
import type { Annotation, AnnotationModel, Crop } from "../core/annotation";
import type { Point } from "../core/annotations";
import type { RunFont } from "../core/annotations/runs";
import type { Style } from "../core/propertyGroups";
import type { AnnotationCanvas, CanvasEvents, CanvasKit, CanvasLayout, MountOptions, TextSelection } from "./types";

export interface StubCanvas extends AnnotationCanvas {
  readonly events: CanvasEvents;
  readonly size: MountOptions["size"];
  /** What the editor last told the canvas. */
  model: AnnotationModel | null;
  /** The pasted images' bytes the editor last handed the canvas. */
  images: Readonly<Record<string, Uint8Array>> | undefined;
  tool: string;
  drawStyle: Style;
  /** The selected Annotation when exactly one is; null for none or several. */
  selected: string | null;
  /** Every selected Annotation. */
  selectedIds: string[];
  scale: number;
  /** The visible area, background and margin the editor last told the canvas. */
  layout: CanvasLayout;
  interactive: boolean;
  disposed: boolean;
  /** The user finishes drawing `annotation`; `bounds` is what it covers (a gesture that reaches past the edge). */
  draw(annotation: Annotation, bounds?: Crop): void;
  /** The user moves or resizes an Annotation; `bounds` is what it now covers. */
  edit(id: string, patch: Partial<Annotation>, bounds?: Crop): void;
  /** The user finishes a Crop drag (a fresh rectangle) or, with "handle", drags one of the frame's handles. */
  dragCrop(crop: Crop, how?: "handle"): void;
  /** The user finishes an erase drag (the Pen in Eraser mode): the pointer path and the eraser's radius, in Capture pixels. */
  erase(path: Point[], radius: number): void;
  /** The user clicks an Annotation (or empty space, with null). */
  click(id: string | null): void;
  /** The user drags a rubber band (or Shift-clicks) around several Annotations. */
  clickMany(ids: readonly string[]): void;
  /** The user drags a multi-selection: each Annotation's new geometry. */
  editMany(updates: readonly { id: string; patch: Partial<Annotation>; bounds?: Crop }[]): void;
  /** The characters the user selects while typing in a box (null: a caret only, or the edit ended). */
  selectText(selection: TextSelection | null): void;
  /** Every `styleTextSelection` the editor asked for, in order. */
  textStyled: RunFont[];
  /** How many times the editor handed the keyboard back to the text. */
  textFocused: number;
  /** True while a test pretends a new box is being typed in; `cancelTyping` then ends it (and says so). */
  typing: boolean;
  /** How many times the editor ended the box being typed in (Undo of placing it). */
  typingCancelled: number;
}

export interface StubKit extends CanvasKit {
  readonly canvases: StubCanvas[];
  /** The canvas of the image on show. */
  readonly latest: StubCanvas;
  /** Replaceable by a test that wants to see what the Export renderer is given. */
  render: CanvasKit["render"];
}

export function createStubKit(): StubKit {
  const canvases: StubCanvas[] = [];
  return {
    canvases,
    get latest() {
      return canvases.at(-1)!;
    },
    // The real renderer burns pixels in; here the Capture stands in, and tests check what it was given.
    render: async (image) => image.capture,
    mount: async (_host, { size, events, layout }) => {
      const canvas: StubCanvas = {
        events,
        size,
        model: null,
        images: undefined,
        tool: "select",
        drawStyle: {},
        selected: null,
        selectedIds: [],
        scale: 1,
        layout,
        interactive: true,
        disposed: false,
        textStyled: [],
        textFocused: 0,
        typing: false,
        typingCancelled: 0,
        sync(model, images) {
          canvas.model = model;
          canvas.images = images;
        },
        setTool(tool) {
          canvas.tool = tool;
          canvas.selected = null;
          canvas.selectedIds = [];
        },
        setDrawStyle(style) {
          canvas.drawStyle = style;
        },
        select(ids) {
          canvas.selectedIds = [...ids];
          canvas.selected = ids.length === 1 ? ids[0]! : null;
        },
        setScale(scale) {
          canvas.scale = scale;
        },
        setLayout(next) {
          canvas.layout = next;
        },
        styleTextSelection(patch) {
          canvas.textStyled.push(patch);
        },
        cancelTyping() {
          if (!canvas.typing) return false;
          canvas.typing = false;
          canvas.typingCancelled++;
          return true;
        },
        focusText() {
          canvas.textFocused++;
        },
        setInteractive(interactive) {
          canvas.interactive = interactive;
        },
        dispose() {
          canvas.disposed = true;
        },
        draw: (annotation, bounds) => events.onCreate(annotation, bounds),
        dragCrop: (crop, how) => events.onCrop(crop, how),
        edit: (id, patch, bounds) => events.onUpdate(id, patch, bounds),
        erase: (path, radius) => events.onErase(path, radius),
        selectText: (selection) => events.onTextSelection?.(selection),
        click(id) {
          canvas.selected = id;
          canvas.selectedIds = id === null ? [] : [id];
          events.onSelect(canvas.selectedIds);
        },
        clickMany(ids) {
          canvas.selectedIds = [...ids];
          canvas.selected = ids.length === 1 ? ids[0]! : null;
          events.onSelect(ids);
        },
        editMany: (updates) => events.onUpdateMany(updates),
      };
      canvases.push(canvas);
      return canvas;
    },
  };
}
