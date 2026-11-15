// Test-only helpers: an independent PNG pixel decoder built on node:zlib, so tests never
// check the core against its own code.
import { inflateSync } from "node:zlib";

export interface Pixels {
  width: number;
  height: number;
  rgba: number[];
}

/** Decode an 8-bit RGBA, non-interlaced PNG with any row filters (ours, or a browser canvas's). */
export function decodePixels(png: Uint8Array): Pixels {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      const dv = new DataView(data.buffer, data.byteOffset);
      width = dv.getUint32(0);
      height = dv.getUint32(4);
    }
    if (type === "IDAT") idat.push(Buffer.from(data));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const rgba: number[] = [];
  let previous = new Array<number>(stride).fill(0);
  for (let y = 0; y < height; y++) {
    const start = y * (1 + stride);
    const filter = raw[start]!;
    const row = new Array<number>(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = previous[i]!;
      const c = i >= bpp ? previous[i - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (predictor === undefined) throw new Error(`unknown PNG filter type ${filter}`);
      row[i] = (raw[start + 1 + i]! + predictor) & 0xff;
    }
    rgba.push(...row);
    previous = row;
  }
  return { width, height, rgba };
}

export function hasChunk(png: Uint8Array, type: string): boolean {
  return Buffer.from(png).includes(Buffer.from(type, "latin1"));
}
