import type { BoxGeometry } from "../../core/annotations/box";
import type { ImageAnnotation } from "../../core/annotations/image";
import { finish, OPTIONS, paint, readBox, showBox } from "./boxShapes";
import { ImageShape } from "./imageShape";
import type { ShapeAdapter } from "./shape";

/** The image as the box machinery sees it: a box with no outline of its own (the border is drawn inside it). */
function asBox(a: ImageAnnotation): BoxGeometry {
  return {
    id: a.id,
    x: a.x,
    y: a.y,
    width: a.width,
    height: a.height,
    stroke: { color: "#000000", width: 0 },
    fill: { mode: "none", color: "#000000", opacity: 0 },
  };
}

function style(shape: ImageShape, a: ImageAnnotation) {
  shape.imageId = a.imageId;
  shape.imageOpacity = a.opacity.value;
  shape.border = a.border;
}

export const imageAdapter: ShapeAdapter<ImageAnnotation> = {
  type: "image",
  create(a, assets) {
    const box = asBox(a);
    // The whole box is grabbable, not only its outline.
    const shape = new ImageShape({ ...OPTIONS, perPixelTargetFind: false, ...paint(box), width: a.width, height: a.height });
    style(shape, a);
    shape.bitmap = assets?.image(a.imageId) ?? null;
    // Eight handles; no flipping by dragging past the opposite edge; corners keep the shape unless Shift is held.
    return finish(shape, box, { fixed: true });
  },
  update(object, a) {
    style(object as ImageShape, a);
    showBox(object, asBox(a));
  },
  read: readBox,
};
