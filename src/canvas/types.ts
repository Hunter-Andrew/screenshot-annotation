// The seam between the editor UI and the canvas library (Fabric.js). Nothing here imports Fabric,
// so the editor and its tests never load it: the real implementation is behind `fabricKit` (kit.ts)
// and is loaded on first use; tests pass a stub kit. The canvas only renders and edits the
// app-owned model (ADR 0005); the model is the source of truth and the canvas follows it.
import type { FinishedRenderer } from "../core/annotatedImage";
import type { Annotation, AnnotationModel, Background, Crop } from "../core/annotation";
import type { Point } from "../core/annotations";
import type { Style } from "../core/propertyGroups";

export interface Size {
  width: number;
  height: number;
}

/** What the canvas shows besides the Annotations (ticket 37), all in Capture pixels. */
export interface CanvasLayout {
  /** The visible area: the finished image. It may be smaller than the Capture, or reach past it. */
  area: Crop;
  /** The part the canvas covers: the area plus the dark margin (and as much of the Capture as the well shows). */
  workspace: Crop;
  /** What fills the area outside the Capture. */
  background: Background;
  /** How dark everything outside the visible area is drawn, 0 to 95 percent (Settings). */
  darkness: number;
  /** False: nothing of the cropped-out Capture or of Annotations outside the area is drawn (the outside is only the dark fill). */
  showOutside: boolean;
}

/** What the canvas tells the editor. The editor applies the change to the model through the edit session. */
export interface CanvasEvents {
  /**
   * A drawing gesture finished with a new Annotation (already in the tool's current style). `bounds` is what
   * it covers in Capture pixels (stroke and all): the editor grows the visible area to include it.
   */
  onCreate(annotation: Annotation, bounds?: Crop): void;
  /** A selected Annotation was moved or resized: `patch` holds its new geometry, `bounds` what it now covers. */
  onUpdate(id: string, patch: Partial<Annotation>, bounds?: Crop): void;
  /**
   * An erase drag finished (the Pen in Eraser mode): the pointer's path (Capture pixels; one point for a click) and
   * the eraser's radius. The editor cuts the Pen strokes it touched, as one edit. While dragging the canvas only previews.
   */
  onErase(path: Point[], radius: number): void;
  /** The selection changed (null: nothing selected). */
  onSelect(id: string | null): void;
  /**
   * A Crop gesture finished (the Crop tool): the new visible area in whole pixels, which may reach past the
   * Capture. `how` is "handle" for a drag of one of the eight handles, otherwise a fresh rectangle was drawn.
   */
  onCrop(crop: Crop, how?: "handle"): void;
}

export interface AnnotationCanvas {
  /**
   * Make the canvas show exactly `model.annotations` (adds, updates and removes objects), in the model's
   * stacking order. `images` holds the PNG bytes of pasted images by `imageId` (ticket 38); the canvas
   * decodes them and draws each image once its bitmap is ready.
   */
  sync(model: AnnotationModel, images?: Readonly<Record<string, Uint8Array>>): void;
  /** The active tool: "select", "crop", or an Annotation type to draw. Choosing a tool clears the selection. */
  setTool(tool: string): void;
  /** The style new Annotations are drawn in. */
  setDrawStyle(style: Style): void;
  /** Settings > Callout tail length (5 to 50): the share of a callout's draw drag its tail takes, for the preview and the result. */
  setCalloutTailPercent(percent: number): void;
  /** Select an Annotation by id, or clear the selection with null. */
  select(id: string | null): void;
  /** Show the canvas at `scale` (1 = Capture pixels): sets its on-screen size and zoom. */
  setScale(scale: number): void;
  /** The visible area, its margin and the background changed (a Crop, an expansion, auto-grow, Undo...). */
  setLayout(layout: CanvasLayout): void;
  /** False for a read-only image: nothing can be drawn or selected. */
  setInteractive(interactive: boolean): void;
  dispose(): void;
}

export interface MountOptions {
  /** The Capture's size in pixels: the canvas's native size. */
  size: Size;
  /**
   * The Capture as an image URL. The canvas draws it as its first layer (under every Annotation) so
   * that a Blur can pixelate what is beneath it; the editor also shows the same image behind the
   * canvas (it shows through until the canvas has loaded it).
   */
  imageUrl?: string;
  /** The first layout; `setLayout` follows every change. */
  layout: CanvasLayout;
  events: CanvasEvents;
}

export interface CanvasKit {
  /** Put an annotation canvas into `host` (an empty element). */
  mount(host: HTMLElement, options: MountOptions): Promise<AnnotationCanvas>;
  /** The Export renderer: the Capture with the Annotations burned in, the visible area applied and its background. */
  render: FinishedRenderer;
}
