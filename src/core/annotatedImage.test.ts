// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createFromCapture,
  decodeLibraryPng,
  encodeLibraryPng,
  exportPng,
} from "./annotatedImage";
import { encodeRgbaPng } from "./png";
import { decodePixels, hasChunk } from "./testing";

// 2x2: red, green / blue, translucent grey
const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 250, 250, 250, 128];
const capturePng = () => encodeRgbaPng(2, 2, new Uint8Array(PIXELS));

describe("Annotated Image storage (ADR 0004)", () => {
  it("round-trips a Capture and its empty Annotation model through a Library PNG", () => {
    const image = createFromCapture(capturePng());
    const decoded = decodeLibraryPng(encodeLibraryPng(image));

    expect(decoded.model).toEqual({ formatVersion: 1, annotations: [], crop: null });
    expect(decoded.readOnly).toBe(false);
    expect(decodePixels(decoded.capture)).toEqual({ width: 2, height: 2, rgba: PIXELS });
  });

  it("makes the Library PNG's visible pixels the finished image", () => {
    const library = encodeLibraryPng(createFromCapture(capturePng()));

    expect(decodePixels(library)).toEqual({ width: 2, height: 2, rgba: PIXELS });
  });

  it("exports a plain PNG: same pixels, no embedded chunk, no Capture", () => {
    const image = createFromCapture(capturePng());
    const library = encodeLibraryPng(image);
    expect(hasChunk(library, "snAP")).toBe(true);

    const exported = exportPng(image);

    expect(hasChunk(exported, "snAP")).toBe(false);
    expect(exported.length).toBeLessThan(library.length);
    expect(decodePixels(exported)).toEqual({ width: 2, height: 2, rgba: PIXELS });
  });

  it("opens a plain PNG as an Annotated Image with no Annotations", () => {
    const decoded = decodeLibraryPng(capturePng());

    expect(decoded.model.annotations).toEqual([]);
    expect(decoded.model.crop).toBeNull();
    expect(decodePixels(decoded.capture).rgba).toEqual(PIXELS);
  });

  it("opens a file from a newer format version read-only", () => {
    const image = createFromCapture(capturePng());
    const newer = encodeLibraryPng({ ...image, model: { ...image.model, formatVersion: 99 } });

    expect(decodeLibraryPng(newer).readOnly).toBe(true);
  });

  it("rejects bytes that are not a PNG", () => {
    expect(() => decodeLibraryPng(new Uint8Array([1, 2, 3]))).toThrow(/PNG/);
  });
});
