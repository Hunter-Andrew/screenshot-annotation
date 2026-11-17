// Pixelating what a canvas has drawn so far. The Blur Annotation draws by calling this on the
// context it is being drawn into, so it sees the composite of everything beneath it in the
// stacking order (draw order is stacking order), in the editor canvas and in the Export alike.

/** A box in the canvas's own pixels, the transform already applied. */
export interface DeviceBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Replace the pixels of `box` by squares of their average colour. The squares are `block` wide,
 * laid out from the box's top-left corner (the last column and row may be narrower). `block` and
 * `box` are in the same (canvas) pixels; a block's edges are rounded to whole pixels, shared by
 * its neighbours so there are no gaps. Transparency is averaged too (premultiplied), so a canvas
 * that is not yet opaque stays honest.
 */
export function pixelate(ctx: CanvasRenderingContext2D, box: DeviceBox, block: number): void {
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  const x0 = Math.max(0, Math.round(box.left));
  const y0 = Math.max(0, Math.round(box.top));
  const x1 = Math.min(canvasW, Math.round(box.left + box.width));
  const y1 = Math.min(canvasH, Math.round(box.top + box.height));
  if (x1 <= x0 || y1 <= y0 || !(block > 0)) return;

  const image = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const data = image.data;
  const stride = image.width;
  // Block edges are counted from the box's own corner, then clipped to the part on the canvas.
  const edges = (from: number, to: number, origin: number, end: number) => {
    const list = [from];
    for (let edge = origin + block; edge < end; edge += block) {
      const rounded = Math.round(edge);
      if (rounded > list[list.length - 1]! && rounded < to) list.push(rounded);
    }
    list.push(to);
    return list;
  };
  const colsFrom = edges(x0, x1, box.left, box.left + box.width);
  const rowsFrom = edges(y0, y1, box.top, box.top + box.height);

  for (let r = 0; r + 1 < rowsFrom.length; r++) {
    for (let c = 0; c + 1 < colsFrom.length; c++) {
      const bx0 = colsFrom[c]! - x0;
      const bx1 = colsFrom[c + 1]! - x0;
      const by0 = rowsFrom[r]! - y0;
      const by1 = rowsFrom[r + 1]! - y0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let y = by0; y < by1; y++) {
        for (let x = bx0; x < bx1; x++) {
          const i = (y * stride + x) * 4;
          const a = data[i + 3]!;
          red += data[i]! * a;
          green += data[i + 1]! * a;
          blue += data[i + 2]! * a;
          alpha += a;
        }
      }
      const count = (bx1 - bx0) * (by1 - by0);
      const out = alpha === 0 ? [0, 0, 0, 0] : [red / alpha, green / alpha, blue / alpha, alpha / count];
      const [pr, pg, pb, pa] = out.map((v) => Math.round(v)) as [number, number, number, number];
      for (let y = by0; y < by1; y++) {
        for (let x = bx0; x < bx1; x++) {
          const i = (y * stride + x) * 4;
          data[i] = pr;
          data[i + 1] = pg;
          data[i + 2] = pb;
          data[i + 3] = pa;
        }
      }
    }
  }
  // putImageData writes the pixels as they are: no blending with, and no transform of, the canvas.
  ctx.putImageData(image, x0, y0);
}
