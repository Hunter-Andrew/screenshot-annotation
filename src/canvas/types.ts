// The seam between the editor UI and the canvas library (Fabric.js). Nothing here imports Fabric,
// so the editor and its tests never load it: the real implementation is behind `fabricKit` (kit.ts)
// and is loaded on first use; tests pass a stub kit. The canvas only renders and edits the
// app-owned model (ADR 0005); the model is the source of truth and the canvas follows it.
import type { FinishedRenderer } from "../core/annotatedImage";
import type { Annotation, AnnotationModel, Crop } from "../core/annotation";
import type { Style } from "../core/propertyGroups";

export interface Size {
  width: number;
  height: number;
}

/** What the canvas tells the editor. The editor applies the change to the model through the edit session. */
export interface CanvasEvents {
  /** A drawing gesture finished with a new Annotation (already in the tool's current style). */
  onCreate(annotation: Annotation): void;
  /** A selected Annotation was moved or resized: `patch` holds its new geometry. */
  onUpdate(id: string, patch: Partial<Annotation>): void;
  /** The selection changed (null: nothing selected). */
  onSelect(id: string | null): void;
  /** A Crop drag finished (the Crop tool): the new visible area, whole pixels inside the Capture. */
  onCrop(crop: Crop): void;
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
  /** Select an Annotation by id, or clear the selection with null. */
  select(id: string | null): void;
  /** Show the canvas at `scale` (1 = Capture pixels): sets its on-screen size and zoom. */
  setScale(scale: number): void;
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
  events: CanvasEvents;
}

export interface CanvasKit {
  /** Put an annotation canvas into `host` (an empty element). */
  mount(host: HTMLElement, options: MountOptions): Promise<AnnotationCanvas>;
  /** The Export renderer: the Capture with the Annotations burned in and the Crop applied. */
  render: FinishedRenderer;
}
