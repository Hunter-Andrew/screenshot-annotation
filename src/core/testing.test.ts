// @vitest-environment node
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodeRgbaPng } from "./png";
import { decodePixels } from "./testing";

// Build a PNG the way a real encoder (a browser's canvas) does: with a filter per row, compressed.
// The forward filters below are written out from the PNG specification, section 9.
function pngWithFilters(width: number, rows: number[][], filters: number[]): Uint8Array {
  const bpp = 4;
  const raw: number[] = [];
  rows.forEach((row, y) => {
    const prev = y > 0 ? rows[y - 1]! : row.map(() => 0);
    raw.push(filters[y]!);
    row.forEach((value, i) => {
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const predicted = [0, a, b, Math.floor((a + b) / 2), paeth][filters[y]!]!;
      raw.push((value - predicted) & 0xff);
    });
  });
  // Reuse our encoder only for the surrounding chunks, swapping in the filtered, compressed data.
  const template = encodeRgbaPng(width, rows.length, new Uint8Array(width * rows.length * 4));
  const idat = deflateSync(Buffer.from(raw));
  const out: number[] = Array.from(template.subarray(0, 8));
  let offset = 8;
  while (offset < template.length) {
    const length = new DataView(template.buffer, template.byteOffset).getUint32(offset);
    const type = String.fromCharCode(...template.subarray(offset + 4, offset + 8));
    const body = type === "IDAT" ? new Uint8Array(idat) : template.subarray(offset + 8, offset + 8 + length);
    const chunk = new Uint8Array(12 + body.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, body.length);
    chunk.set(template.subarray(offset + 4, offset + 8), 4);
    chunk.set(body, 8);
    view.setUint32(8 + body.length, 0); // the test decoder does not check CRCs
    out.push(...chunk);
    offset += 12 + length;
  }
  return Uint8Array.from(out);
}

describe("decodePixels (the independent test decoder)", () => {
  const rows = [
    [10, 20, 30, 255, 40, 60, 80, 255, 200, 100, 50, 255],
    [11, 22, 33, 255, 90, 70, 50, 255, 5, 250, 125, 255],
    [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
  ];

  for (const [name, filter] of [["None", 0], ["Sub", 1], ["Up", 2], ["Average", 3], ["Paeth", 4]] as const) {
    it(`reads rows filtered with ${name}`, () => {
      const png = pngWithFilters(3, rows, [filter, filter, filter]);

      expect(decodePixels(png)).toEqual({ width: 3, height: 3, rgba: rows.flat() });
    });
  }

  it("reads a mix of filters in one image, as real encoders write", () => {
    const png = pngWithFilters(3, rows, [1, 4, 2]);

    expect(decodePixels(png).rgba).toEqual(rows.flat());
  });
});
