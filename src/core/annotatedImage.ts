// The Annotated Image core (ADR 0004, 0005): a Capture plus its Annotation model.
// Pure TypeScript; no Tauri or DOM. Public operations: create, edit (editSession.ts), encode,
// decode, Export. Drawing the Annotations into pixels needs a canvas, so it is injected as a
// `FinishedRenderer` (the browser build supplies src/canvas/renderFinished.ts). Undo/redo: ticket 13.
import {
  type AnnotationModel,
  emptyModel,
  FORMAT_VERSION,
  IMAGE_FORMAT_VERSION,
  SUPPORTED_FORMAT_VERSION,
} from "./annotation";
import { tidyRuns } from "./annotations/runs";
import { contentHash } from "./hash";
import { addChunk, findChunk, findChunks, insertChunk, isPng, removeChunks } from "./png";

/** Private, ancillary, unsafe-to-copy PNG chunk that only this app reads. */
export const EMBED_CHUNK = "snAP";
/** One per distinct pasted image (ticket 38): the id of the picture, then its PNG bytes. Same rules as `snAP`. */
export const IMAGE_CHUNK = "snIM";

export interface AnnotatedImage {
  /** The original Capture as a PNG, never altered. */
  capture: Uint8Array;
  model: AnnotationModel;
  /**
   * The PNG bytes of every pasted image this session knows, by `imageId`, including ones no Annotation
   * references right now (a deleted image stays here so Undo can bring it back). Only the referenced
   * ones are written to a Library file.
   */
  images?: Readonly<Record<string, Uint8Array>>;
}

export interface DecodedImage extends AnnotatedImage {
  /** True when the file was written by a newer format version: show it, but do not save over it. */
  readOnly: boolean;
}

/** The id of a pasted picture: the SHA-256 of its PNG bytes, so the same picture pasted twice is one id. */
export function imageIdFor(png: Uint8Array): Promise<string> {
  return contentHash(png);
}

/** The ids of the pasted images the model references, each once, in stacking order. */
export function usedImageIds(model: AnnotationModel): string[] {
  const ids: string[] = [];
  for (const a of model.annotations) if (a.type === "image" && !ids.includes(a.imageId)) ids.push(a.imageId);
  return ids;
}

/** The version a file with this model is written as: 2 only when it holds an image Annotation. */
export function formatVersionFor(model: AnnotationModel): number {
  // A model that came from a newer version keeps its number (it is read-only and never written in practice).
  if (model.formatVersion > SUPPORTED_FORMAT_VERSION) return model.formatVersion;
  return usedImageIds(model).length > 0 ? IMAGE_FORMAT_VERSION : FORMAT_VERSION;
}

/** `png` as a plain PNG: neither the editable data (`snAP`) nor any pasted image (`snIM`) is left in it. */
export function stripEmbedded(png: Uint8Array): Uint8Array {
  return removeChunks(removeChunks(png, EMBED_CHUNK), IMAGE_CHUNK);
}

/** `showOutside`: the Settings default for "show outside the canvas", stored with a new image (left out: not stored, so it counts as true). */
export function createFromCapture(capturePng: Uint8Array, options: { showOutside?: boolean } = {}): AnnotatedImage {
  if (!isPng(capturePng)) throw new Error("A Capture must be a PNG");
  const model = emptyModel();
  return { capture: capturePng, model: options.showOutside === undefined ? model : { ...model, showOutside: options.showOutside } };
}

/**
 * Draws the finished image: the Capture with the Annotations burned in and the Crop applied, as a
 * PNG. Async because it needs a canvas.
 */
export type FinishedRenderer = (image: AnnotatedImage) => Promise<Uint8Array>;

/** The finished image as a plain PNG: Annotations rendered, Crop applied. */
async function renderFinished(image: AnnotatedImage, render?: FinishedRenderer): Promise<Uint8Array> {
  if (image.model.annotations.length === 0 && image.model.crop === null) {
    return stripEmbedded(image.capture);
  }
  // Never fall back to the bare Capture: that would leak the unannotated (or unblurred) pixels.
  if (!render) throw new Error("This image has Annotations or a Crop and needs a renderer to be exported");
  return render(image);
}

/** The flattened image for use outside the app. Never carries the embedded data or the Capture. */
export async function exportPng(image: AnnotatedImage, render?: FinishedRenderer): Promise<Uint8Array> {
  return stripEmbedded(await renderFinished(image, render));
}

// Embedded payload: u32 BE length of the JSON model, the JSON (UTF-8), then the Capture PNG.
function packEmbedded(image: AnnotatedImage): Uint8Array {
  const model = { ...image.model, formatVersion: formatVersionFor(image.model) };
  const json = new TextEncoder().encode(JSON.stringify(model));
  const out = new Uint8Array(4 + json.length + image.capture.length);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  out.set(image.capture, 4 + json.length);
  return out;
}

// One snIM chunk: u8 length of the id, the id (UTF-8), then the picture's PNG.
function packImage(id: string, png: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode(id);
  const out = new Uint8Array(1 + name.length + png.length);
  out[0] = name.length;
  out.set(name, 1);
  out.set(png, 1 + name.length);
  return out;
}

function unpackImage(data: Uint8Array): [string, Uint8Array] {
  const length = data[0]!;
  return [new TextDecoder().decode(data.subarray(1, 1 + length)), data.slice(1 + length)];
}

function unpackEmbedded(data: Uint8Array): AnnotatedImage {
  const jsonLength = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
  const model = JSON.parse(
    new TextDecoder().decode(data.subarray(4, 4 + jsonLength)),
  ) as AnnotationModel;
  // Runs in a file are untrusted (older, newer or damaged): only well-formed ones reach the editor.
  if (Array.isArray(model.annotations)) model.annotations = model.annotations.map(tidyRuns);
  return { model, capture: data.slice(4 + jsonLength) };
}

/** A Library PNG: visible pixels are the finished image; the editable data rides in a chunk. */
export async function encodeLibraryPng(image: AnnotatedImage, render?: FinishedRenderer): Promise<Uint8Array> {
  let png = insertChunk(await renderFinished(image, render), EMBED_CHUNK, packEmbedded(image));
  // Only the pictures an Annotation still uses; the rest are dropped on this save.
  for (const id of usedImageIds(image.model)) {
    const bytes = image.images?.[id];
    if (bytes) png = addChunk(png, IMAGE_CHUNK, packImage(id, bytes));
  }
  return png;
}

/** Read a Library PNG, or any plain PNG (which becomes an Annotated Image with no Annotations). */
export function decodeLibraryPng(bytes: Uint8Array, supportedVersion = SUPPORTED_FORMAT_VERSION): DecodedImage {
  if (!isPng(bytes)) throw new Error("Not a PNG file");
  const embedded = findChunk(bytes, EMBED_CHUNK);
  if (!embedded) return { ...createFromCapture(stripEmbedded(bytes)), readOnly: false };
  const image = unpackEmbedded(embedded);
  const images = Object.fromEntries(findChunks(bytes, IMAGE_CHUNK).map(unpackImage));
  return { ...image, images, readOnly: image.model.formatVersion > supportedVersion };
}
