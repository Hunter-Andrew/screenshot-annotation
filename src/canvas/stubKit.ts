// Test-only: a CanvasKit with no canvas, for the editor's jsdom tests (jsdom has no 2D canvas, and
// Fabric needs one). It records what the editor tells the canvas, and lets a test play the part of
// the user's gestures. The real canvas is exercised by the Playwright tests in e2e/.
import type { Annotation, AnnotationModel, Crop } from "../core/annotation";
import type { Style } from "../core/propertyGroups";
import type { AnnotationCanvas, CanvasEvents, CanvasKit, CanvasLayout, MountOptions } from "./types";

export interface StubCanvas extends AnnotationCanvas {
  readonly events: CanvasEvents;
  readonly size: MountOptions["size"];
  /** What the editor last told the canvas. */
  model: AnnotationModel | null;
  /** The pasted images' bytes the editor last handed the canvas. */
  images: Readonly<Record<string, Uint8Array>> | undefined;
  tool: string;
  drawStyle: Style;
  /** The callout tail percentage the editor last told the canvas. */
  calloutTailPercent: number | null;
  selected: string | null;
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
    mount: async (_host, { size, events, layout }) => {
      const canvas: StubCanvas = {
        events,
        size,
        model: null,
        images: undefined,
        tool: "select",
        drawStyle: {},
        calloutTailPercent: null,
        selected: null,
        scale: 1,
        layout,
        interactive: true,
        disposed: false,
        sync(model, images) {
          canvas.model = model;
          canvas.images = images;
        },
        setTool(tool) {
          canvas.tool = tool;
          canvas.selected = null;
        },
        setDrawStyle(style) {
          canvas.drawStyle = style;
        },
        setCalloutTailPercent(percent) {
          canvas.calloutTailPercent = percent;
        },
        select(id) {
          canvas.selected = id;
        },
        setScale(scale) {
          canvas.scale = scale;
        },
        setLayout(next) {
          canvas.layout = next;
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
