// Test-only: a CanvasKit with no canvas, for the editor's jsdom tests (jsdom has no 2D canvas, and
// Fabric needs one). It records what the editor tells the canvas, and lets a test play the part of
// the user's gestures. The real canvas is exercised by the Playwright tests in e2e/.
import type { Annotation, AnnotationModel, Crop } from "../core/annotation";
import type { Style } from "../core/propertyGroups";
import type { AnnotationCanvas, CanvasEvents, CanvasKit, MountOptions } from "./types";

export interface StubCanvas extends AnnotationCanvas {
  readonly events: CanvasEvents;
  readonly size: MountOptions["size"];
  /** What the editor last told the canvas. */
  model: AnnotationModel | null;
  tool: string;
  drawStyle: Style;
  selected: string | null;
  scale: number;
  interactive: boolean;
  disposed: boolean;
  /** The user finishes drawing `annotation`. */
  draw(annotation: Annotation): void;
  /** The user moves or resizes an Annotation. */
  edit(id: string, patch: Partial<Annotation>): void;
  /** The user finishes a Crop drag. */
  dragCrop(crop: Crop): void;
  /** The user clicks an Annotation (or empty space, with null). */
  click(id: string | null): void;
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
    mount: async (_host, { size, events }) => {
      const canvas: StubCanvas = {
        events,
        size,
        model: null,
        tool: "select",
        drawStyle: {},
        selected: null,
        scale: 1,
        interactive: true,
        disposed: false,
        sync(model) {
          canvas.model = model;
        },
        setTool(tool) {
          canvas.tool = tool;
          canvas.selected = null;
        },
        setDrawStyle(style) {
          canvas.drawStyle = style;
        },
        select(id) {
          canvas.selected = id;
        },
        setScale(scale) {
          canvas.scale = scale;
        },
        setInteractive(interactive) {
          canvas.interactive = interactive;
        },
        dispose() {
          canvas.disposed = true;
        },
        draw: (annotation) => events.onCreate(annotation),
        dragCrop: (crop) => events.onCrop(crop),
        edit: (id, patch) => events.onUpdate(id, patch),
        click(id) {
          canvas.selected = id;
          events.onSelect(id);
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
}
