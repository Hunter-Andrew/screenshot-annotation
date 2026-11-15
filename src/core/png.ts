// Minimal PNG chunk handling: enough to embed, find and strip one private chunk (ADR 0004).
// Pure TypeScript, no DOM and no Tauri.

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export interface Chunk {
  type: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

export function readChunks(png: Uint8Array): Chunk[] {
  if (!isPng(png)) throw new Error("Not a PNG file");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error("Truncated PNG chunk");
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset = end;
  }
  return chunks;
}

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function assemble(chunks: Chunk[]): Uint8Array {
  const parts = [Uint8Array.from(SIGNATURE), ...chunks.map((c) => writeChunk(c.type, c.data))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Copy of `png` without any chunk of `type`. */
export function removeChunks(png: Uint8Array, type: string): Uint8Array {
  return assemble(readChunks(png).filter((c) => c.type !== type));
}

/** Copy of `png` with one chunk inserted just before IEND, replacing any chunk of the same type. */
export function insertChunk(png: Uint8Array, type: string, data: Uint8Array): Uint8Array {
  const chunks = readChunks(png).filter((c) => c.type !== type);
  const iend = chunks.findIndex((c) => c.type === "IEND");
  if (iend < 0) throw new Error("PNG has no IEND chunk");
  chunks.splice(iend, 0, { type, data });
  return assemble(chunks);
}

export function findChunk(png: Uint8Array, type: string): Uint8Array | undefined {
  return readChunks(png).find((c) => c.type === type)?.data;
}

export function readSize(png: Uint8Array): { width: number; height: number } {
  const ihdr = findChunk(png, "IHDR");
  if (!ihdr || ihdr.length < 8) throw new Error("PNG has no IHDR chunk");
  const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  return { width: view.getUint32(0), height: view.getUint32(4) };
}

/**
 * Encode 8-bit RGBA pixels as a PNG using uncompressed deflate blocks. Big but trivially
 * correct; used by the fake bridge and tests. The real capture is encoded by Rust.
 */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error("rgba length does not match size");
  const rowBytes = width * 4;
  const raw = new Uint8Array(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * (1 + rowBytes) + 1);
  }
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78;
  z[1] = 0x01;
  let zo = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    z[zo++] = b === blocks - 1 ? 1 : 0;
    z[zo++] = len & 0xff;
    z[zo++] = len >>> 8;
    z[zo++] = ~len & 0xff;
    z[zo++] = (~len >>> 8) & 0xff;
    z.set(raw.subarray(start, start + len), zo);
    zo += len;
  }
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  new DataView(z.buffer).setUint32(zo, ((b << 16) | a) >>> 0);

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return assemble([
    { type: "IHDR", data: ihdr },
    { type: "IDAT", data: z },
    { type: "IEND", data: new Uint8Array(0) },
  ]);
}
