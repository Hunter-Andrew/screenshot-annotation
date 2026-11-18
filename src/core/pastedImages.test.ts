// @vitest-environment node
// Pasted images (ticket 38) in the core: how they ride in a Library PNG (the `snIM` chunk, one per
// distinct image), the format version, the plain Export, and what an unreferenced image does.
import { describe, expect, it } from "vitest";
import {
  type AnnotatedImage,
  createFromCapture,
  decodeLibraryPng,
  encodeLibraryPng,
  exportPng,
  type FinishedRenderer,
  imageIdFor,
  usedImageIds,
} from "./annotatedImage";
import type { ImageAnnotation } from "./annotation";
import { applyEdit } from "./editSession";
import { encodeRgbaPng, readChunks } from "./png";
import { decodePixels, hasChunk } from "./testing";

const capturePng = () => encodeRgbaPng(2, 2, new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255]));
// A different 3x1 picture to paste.
const PASTED_PIXELS = [1, 2, 3, 255, 4, 5, 6, 200, 7, 8, 9, 100];
const pastedPng = () => encodeRgbaPng(3, 1, new Uint8Array(PASTED_PIXELS));
const otherPng = () => encodeRgbaPng(1, 1, new Uint8Array([10, 20, 30, 255]));

const imageAnnotation = (id: string, imageId: string): ImageAnnotation => ({
  id,
  type: "image",
  x: 0,
  y: 0,
  width: 3,
  height: 1,
  imageId,
  border: { enabled: false, color: "#e02424", width: 4 },
  opacity: { value: 1 },
});

async function withImages(...pngs: Uint8Array[]): Promise<{ image: AnnotatedImage; ids: string[] }> {
  let image = createFromCapture(capturePng());
  const ids: string[] = [];
  for (const [i, png] of pngs.entries()) {
    const id = await imageIdFor(png);
    ids.push(id);
    image = { ...image, images: { ...image.images, [id]: png } };
    image = applyEdit(image, { kind: "add", annotation: imageAnnotation(`i${i}`, id) });
  }
  return { image, ids };
}

const snIMCount = (png: Uint8Array) => readChunks(png).filter((c) => c.type === "snIM").length;
// The finished image a renderer would produce: stands in for drawing.
const finished: FinishedRenderer = async () => encodeRgbaPng(2, 2, new Uint8Array(16).fill(200));

describe("the snIM chunk", () => {
  it("round-trips the model and the pasted image's bytes through a Library PNG unchanged", async () => {
    const { image, ids } = await withImages(pastedPng());
    const decoded = decodeLibraryPng(await encodeLibraryPng(image, finished));

    expect(decoded.model.annotations).toEqual(image.model.annotations);
    expect(decoded.model.crop).toBeNull();
    expect(decoded.images?.[ids[0]!]).toEqual(pastedPng());
    expect(decoded.readOnly).toBe(false);
  });

  it("stores the same image pasted twice once, and two different images as two chunks", async () => {
    const twice = await withImages(pastedPng(), pastedPng());
    expect(twice.ids[0]).toBe(twice.ids[1]);
    expect(snIMCount(await encodeLibraryPng(twice.image, finished))).toBe(1);

    const two = await withImages(pastedPng(), otherPng());
    expect(two.ids[0]).not.toBe(two.ids[1]);
    const bytes = await encodeLibraryPng(two.image, finished);
    expect(snIMCount(bytes)).toBe(2);
    expect(Object.keys(decodeLibraryPng(bytes).images ?? {}).sort()).toEqual([...two.ids].sort());
  });

  it("drops a chunk that no Annotation references any more on the next save", async () => {
    const { image, ids } = await withImages(pastedPng(), otherPng());
    const deleted = applyEdit(image, { kind: "delete", id: "i1" });
    // The bytes are still held in memory (Undo needs them)...
    expect(Object.keys(deleted.images ?? {})).toContain(ids[1]);
    expect(usedImageIds(deleted.model)).toEqual([ids[0]]);
    // ...but the file carries only what is referenced.
    const decoded = decodeLibraryPng(await encodeLibraryPng(deleted, finished));
    expect(Object.keys(decoded.images ?? {})).toEqual([ids[0]]);
  });

  it("writes no chunk for an image without pasted images", async () => {
    const png = await encodeLibraryPng(createFromCapture(capturePng()));
    expect(snIMCount(png)).toBe(0);
    expect(decodeLibraryPng(png).images ?? {}).toEqual({});
  });
});

describe("format version", () => {
  it("is 2 exactly when the model has an image Annotation, and 1 otherwise", async () => {
    const plain = decodeLibraryPng(await encodeLibraryPng(createFromCapture(capturePng())));
    expect(plain.model.formatVersion).toBe(1);

    const { image } = await withImages(pastedPng());
    expect(decodeLibraryPng(await encodeLibraryPng(image, finished)).model.formatVersion).toBe(2);

    // Deleting the only image goes back to a version 1 file.
    const without = applyEdit(image, { kind: "delete", id: "i0" });
    expect(decodeLibraryPng(await encodeLibraryPng(without, finished)).model.formatVersion).toBe(1);
  });

  it("opens read-only in a reader that supports version 1, and editable in this one", async () => {
    const { image } = await withImages(pastedPng());
    const bytes = await encodeLibraryPng(image, finished);
    expect(decodeLibraryPng(bytes, 1).readOnly).toBe(true);
    expect(decodeLibraryPng(bytes).readOnly).toBe(false);
  });
});

describe("Export of an image with a pasted image", () => {
  it("is a plain PNG: neither snAP nor snIM, only the finished pixels", async () => {
    const { image } = await withImages(pastedPng());
    const library = await encodeLibraryPng(image, finished);
    expect(hasChunk(library, "snIM")).toBe(true);

    const exported = await exportPng(image, finished);
    expect(hasChunk(exported, "snAP")).toBe(false);
    expect(hasChunk(exported, "snIM")).toBe(false);
    expect(decodePixels(exported).rgba).toEqual(new Array(16).fill(200));
  });
});
