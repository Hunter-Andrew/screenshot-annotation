// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  type AnnotatedImage,
  createFromCapture,
  decodeLibraryPng,
  encodeLibraryPng,
  exportPng,
  type FinishedRenderer,
} from "./annotatedImage";
import { type ArrowAnnotation } from "./annotation";
import { applyEdit } from "./editSession";
import { encodeRgbaPng, insertChunk } from "./png";
import { decodePixels, hasChunk } from "./testing";

// 2x2: red, green / blue, translucent grey
const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 250, 250, 250, 128];
const capturePng = () => encodeRgbaPng(2, 2, new Uint8Array(PIXELS));

// 2x2 all white: stands in for "the finished image" a renderer produced.
const FINISHED = [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255];
const finishedPng = () => encodeRgbaPng(2, 2, new Uint8Array(FINISHED));

const ARROW: ArrowAnnotation = {
  id: "a1",
  type: "arrow",
  x1: 0,
  y1: 0,
  x2: 2,
  y2: 2,
  stroke: { color: "#e02424", width: 4 },
  arrowheads: { ends: "both" },
};
const annotated = (): AnnotatedImage =>
  applyEdit(createFromCapture(capturePng()), { kind: "add", annotation: ARROW });

describe("Annotated Image storage (ADR 0004)", () => {
  it("round-trips a Capture and its empty Annotation model through a Library PNG", async () => {
    const image = createFromCapture(capturePng());
    const decoded = decodeLibraryPng(await encodeLibraryPng(image));

    expect(decoded.model).toEqual({ formatVersion: 1, annotations: [], crop: null });
    expect(decoded.readOnly).toBe(false);
    expect(decodePixels(decoded.capture)).toEqual({ width: 2, height: 2, rgba: PIXELS });
  });

  it("makes the Library PNG's visible pixels the finished image", async () => {
    const library = await encodeLibraryPng(createFromCapture(capturePng()));

    expect(decodePixels(library)).toEqual({ width: 2, height: 2, rgba: PIXELS });
  });

  it("exports a plain PNG: same pixels, no embedded chunk, no Capture", async () => {
    const image = createFromCapture(capturePng());
    const library = await encodeLibraryPng(image);
    expect(hasChunk(library, "snAP")).toBe(true);

    const exported = await exportPng(image);

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

  it("opens a file from a newer format version read-only", async () => {
    const image = createFromCapture(capturePng());
    const newer = await encodeLibraryPng({ ...image, model: { ...image.model, formatVersion: 99 } });

    expect(decodeLibraryPng(newer).readOnly).toBe(true);
  });

  it("rejects bytes that are not a PNG", () => {
    expect(() => decodeLibraryPng(new Uint8Array([1, 2, 3]))).toThrow(/PNG/);
  });
});

describe("Annotated Image with Annotations", () => {
  const render: FinishedRenderer = async () => finishedPng();

  it("round-trips Arrow Annotations through a Library PNG, still editable", async () => {
    const decoded = decodeLibraryPng(await encodeLibraryPng(annotated(), render));

    expect(decoded.model.annotations).toEqual([ARROW]);
    expect(decoded.readOnly).toBe(false);
    // The original Capture rides along untouched; the visible pixels are the finished image.
    expect(decodePixels(decoded.capture).rgba).toEqual(PIXELS);
  });

  it("shows the renderer's finished image as the Library PNG's visible pixels", async () => {
    const library = await encodeLibraryPng(annotated(), render);

    expect(decodePixels(library).rgba).toEqual(FINISHED);
    expect(hasChunk(library, "snAP")).toBe(true);
  });

  it("hands the renderer the whole Annotated Image", async () => {
    const seen: AnnotatedImage[] = [];

    await exportPng(annotated(), async (image) => (seen.push(image), finishedPng()));

    expect(seen).toHaveLength(1);
    expect(seen[0]!.model.annotations).toEqual([ARROW]);
    expect(decodePixels(seen[0]!.capture).rgba).toEqual(PIXELS);
  });

  it("exports the finished image as a plain PNG even if the renderer left the chunk in", async () => {
    const leaky: FinishedRenderer = async (image) =>
      insertChunk(finishedPng(), "snAP", image.capture);

    const exported = await exportPng(annotated(), leaky);

    expect(hasChunk(exported, "snAP")).toBe(false);
    expect(decodePixels(exported).rgba).toEqual(FINISHED);
  });

  it("refuses to export Annotations it cannot draw, rather than leak the bare Capture", async () => {
    await expect(exportPng(annotated())).rejects.toThrow(/renderer/);
    await expect(encodeLibraryPng(annotated())).rejects.toThrow(/renderer/);
  });

  it("does not call the renderer when there is nothing to draw", async () => {
    let calls = 0;
    const counting: FinishedRenderer = async () => (calls++, finishedPng());

    await exportPng(createFromCapture(capturePng()), counting);

    expect(calls).toBe(0);
  });
});
