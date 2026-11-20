// A sharp downscale of the Capture for zooms below 100%. The browser's own canvas scaling averages
// neighbouring pixels with a soft filter, which blurs fine detail such as text; a Lanczos filter keeps
// edges crisp. Pure pixel maths (`resample`) plus a small canvas wrapper with a one-entry cache.

const LOBES = 3;
/** Above this many source pixels the filter would stall the editor: fall back to the browser's scaling. */
const MAX_SOURCE_PIXELS = 24_000_000;

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos = (x: number) => (Math.abs(x) < LOBES ? sinc(x) * sinc(x / LOBES) : 0);

/** For each destination index, the first source index and the weights (summing to 1) of the source pixels it blends. */
function weightsFor(sourceSize: number, destSize: number) {
  const factor = sourceSize / destSize;
  const radius = LOBES * factor;
  return Array.from({ length: destSize }, (_, i) => {
    const centre = (i + 0.5) * factor - 0.5;
    const first = Math.max(0, Math.ceil(centre - radius));
    const last = Math.min(sourceSize - 1, Math.floor(centre + radius));
    const weights: number[] = [];
    let sum = 0;
    for (let j = first; j <= last; j++) {
      const w = lanczos((j - centre) / factor);
      weights.push(w);
      sum += w;
    }
    return { first, weights: weights.map((w) => w / sum) };
  });
}

/** Shrink RGBA pixels (straight alpha) from sw x sh to dw x dh with a Lanczos filter; colours are weighted by alpha. */
export function resample(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const across = weightsFor(sw, dw);
  const down = weightsFor(sh, dh);
  // Horizontal pass into premultiplied floats: dw x sh.
  const mid = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      const { first, weights } = across[x]!;
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < weights.length; k++) {
        const p = (y * sw + first + k) * 4;
        const alpha = src[p + 3]! / 255;
        const w = weights[k]!;
        r += src[p]! * alpha * w;
        g += src[p + 1]! * alpha * w;
        b += src[p + 2]! * alpha * w;
        a += alpha * w;
      }
      const o = (y * dw + x) * 4;
      mid[o] = r;
      mid[o + 1] = g;
      mid[o + 2] = b;
      mid[o + 3] = a;
    }
  }
  // Vertical pass, then back to straight alpha bytes.
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const { first, weights } = down[y]!;
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < weights.length; k++) {
        const p = ((first + k) * dw + x) * 4;
        const w = weights[k]!;
        r += mid[p]! * w;
        g += mid[p + 1]! * w;
        b += mid[p + 2]! * w;
        a += mid[p + 3]! * w;
      }
      const o = (y * dw + x) * 4;
      const alpha = Math.min(1, Math.max(0, a));
      out[o] = alpha > 0 ? r / alpha : 0;
      out[o + 1] = alpha > 0 ? g / alpha : 0;
      out[o + 2] = alpha > 0 ? b / alpha : 0;
      out[o + 3] = alpha * 255;
    }
  }
  return out;
}

let cached: { source: CanvasImageSource; width: number; height: number; canvas: HTMLCanvasElement } | null = null;

/**
 * `source` shrunk to `dw` x `dh` device pixels, or null when that is not possible here (no canvas, too large).
 * The last result is kept: a redraw at the same zoom (every pan, every Annotation edit) costs nothing.
 */
export function sharpDownscale(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap, sw: number, sh: number, dw: number, dh: number): HTMLCanvasElement | null {
  if (dw < 1 || dh < 1 || dw >= sw || dh >= sh || sw * sh > MAX_SOURCE_PIXELS) return null;
  if (cached && cached.source === source && cached.width === dw && cached.height === dh) return cached.canvas;
  try {
    const from = document.createElement("canvas");
    from.width = sw;
    from.height = sh;
    const fromCtx = from.getContext("2d", { willReadFrequently: true });
    if (!fromCtx) return null;
    fromCtx.drawImage(source, 0, 0);
    const pixels = fromCtx.getImageData(0, 0, sw, sh).data;
    const to = document.createElement("canvas");
    to.width = dw;
    to.height = dh;
    const toCtx = to.getContext("2d");
    if (!toCtx) return null;
    const small = resample(pixels, sw, sh, dw, dh);
    toCtx.putImageData(new ImageData(small as Uint8ClampedArray<ArrayBuffer>, dw, dh), 0, 0);
    cached = { source, width: dw, height: dh, canvas: to };
    return to;
  } catch {
    return null;
  }
}
