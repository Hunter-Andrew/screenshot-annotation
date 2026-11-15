// Test-only helpers: an independent PNG pixel decoder built on node:zlib, so tests never
// check the core against its own code.
import { inflateSync } from "node:zlib";

export interface Pixels {
  width: number;
  height: number;
  rgba: number[];
}

/** Decode an 8-bit RGBA, non-interlaced, filter-0 PNG (what `encodeRgbaPng` writes). */
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
  const rgba: number[] = [];
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    if (raw[row] !== 0) throw new Error("test decoder only supports filter type 0");
    for (let i = 0; i < width * 4; i++) rgba.push(raw[row + 1 + i]!);
  }
  return { width, height, rgba };
}

export function hasChunk(png: Uint8Array, type: string): boolean {
  return Buffer.from(png).includes(Buffer.from(type, "latin1"));
}
