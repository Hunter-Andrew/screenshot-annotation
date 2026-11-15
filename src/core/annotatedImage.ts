// The Annotated Image core (ADR 0004, 0005): a Capture plus its Annotation model.
// Pure TypeScript; no Tauri or DOM. Public operations: create, encode, decode, Export.
// (Edits, undo/redo and history arrive with M2.)
import { type AnnotationModel, emptyModel, FORMAT_VERSION } from "./annotation";
import { findChunk, insertChunk, isPng, removeChunks } from "./png";

/** Private, ancillary, unsafe-to-copy PNG chunk that only this app reads. */
export const EMBED_CHUNK = "snAP";

export interface AnnotatedImage {
  /** The original Capture as a PNG, never altered. */
  capture: Uint8Array;
  model: AnnotationModel;
}

export interface DecodedImage extends AnnotatedImage {
  /** True when the file was written by a newer format version: show it, but do not save over it. */
  readOnly: boolean;
}

export function createFromCapture(capturePng: Uint8Array): AnnotatedImage {
  if (!isPng(capturePng)) throw new Error("A Capture must be a PNG");
  return { capture: capturePng, model: emptyModel() };
}

/** The finished image as a plain PNG: Annotations rendered, Crop applied. */
function renderFinished(image: AnnotatedImage): Uint8Array {
  if (image.model.annotations.length > 0 || image.model.crop !== null) {
    throw new Error("Rendering Annotations and Crop is not implemented before M2");
  }
  return removeChunks(image.capture, EMBED_CHUNK);
}

/** The flattened image for use outside the app. Never carries the embedded data or the Capture. */
export function exportPng(image: AnnotatedImage): Uint8Array {
  return removeChunks(renderFinished(image), EMBED_CHUNK);
}

// Embedded payload: u32 BE length of the JSON model, the JSON (UTF-8), then the Capture PNG.
function packEmbedded(image: AnnotatedImage): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(image.model));
  const out = new Uint8Array(4 + json.length + image.capture.length);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  out.set(image.capture, 4 + json.length);
  return out;
}

function unpackEmbedded(data: Uint8Array): AnnotatedImage {
  const jsonLength = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
  const model = JSON.parse(
    new TextDecoder().decode(data.subarray(4, 4 + jsonLength)),
  ) as AnnotationModel;
  return { model, capture: data.slice(4 + jsonLength) };
}

/** A Library PNG: visible pixels are the finished image; the editable data rides in a chunk. */
export function encodeLibraryPng(image: AnnotatedImage): Uint8Array {
  return insertChunk(renderFinished(image), EMBED_CHUNK, packEmbedded(image));
}

/** Read a Library PNG, or any plain PNG (which becomes an Annotated Image with no Annotations). */
export function decodeLibraryPng(bytes: Uint8Array): DecodedImage {
  if (!isPng(bytes)) throw new Error("Not a PNG file");
  const embedded = findChunk(bytes, EMBED_CHUNK);
  if (!embedded) return { ...createFromCapture(removeChunks(bytes, EMBED_CHUNK)), readOnly: false };
  const image = unpackEmbedded(embedded);
  return { ...image, readOnly: image.model.formatVersion > FORMAT_VERSION };
}
