// The thin mapping layer between the app-owned model and Fabric (ADR 0005): one adapter per
// Annotation type. Adding a tool means one file here (`<type>.ts`) and one line in `./index.ts`.
import type { FabricObject } from "fabric";
import type { Annotation } from "../../core/annotation";

/** What a shape may need besides the model: the decoded pictures of pasted images (ticket 38). */
export interface ShapeAssets {
  /** The decoded picture for an `imageId`, or undefined while it is not decoded (the shape then draws nothing yet). */
  image(imageId: string): CanvasImageSource | undefined;
}

export interface ShapeAdapter<A extends Annotation = Annotation> {
  readonly type: A["type"];
  /** A new Fabric object showing `annotation`. */
  create(annotation: A, assets?: ShapeAssets): FabricObject;
  /** Make an existing object show `annotation` (after a restyle, an undo...). */
  update(object: FabricObject, annotation: A): void;
  /**
   * The model properties the user can change by editing the object on the canvas (its geometry), read
   * back after a move or resize. Style never comes back from the canvas: the Style panel owns it.
   */
  read(object: FabricObject): Partial<A>;
  /** Only for a tool the user types into (`AnnotationKind.typedInPlace`): put `object` into in-place editing. */
  beginEdit?(object: FabricObject): void;
}
