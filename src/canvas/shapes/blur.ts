import type { BlurAnnotation } from "../../core/annotations/blur";
import type { BoxGeometry } from "../../core/annotations/box";
import { finish, OPTIONS, paint, readBox, showBox } from "./boxShapes";
import { BlurShape } from "./blurShape";
import type { ShapeAdapter } from "./shape";

/** The Blur as the box machinery sees it: a box with no outline and no fill (it paints by pixelating). */
function asBox(a: BlurAnnotation): BoxGeometry {
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

export const blurAdapter: ShapeAdapter<BlurAnnotation> = {
  type: "blur",
  create(a) {
    const box = asBox(a);
    // The whole box is grabbable (the Rectangle's outline-only hit test would make it unselectable).
    const shape = new BlurShape({ ...OPTIONS, perPixelTargetFind: false, ...paint(box), width: a.width, height: a.height });
    shape.blockSize = a.strength.blockSize;
    return finish(shape, box);
  },
  update(object, a) {
    (object as BlurShape).blockSize = a.strength.blockSize;
    showBox(object, asBox(a));
  },
  read: readBox,
};
