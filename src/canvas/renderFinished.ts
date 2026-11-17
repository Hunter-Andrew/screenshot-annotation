// The Export renderer: the Capture with the Annotations burned in and the Crop applied, as a plain PNG
// at the Capture's native resolution (ADR 0002/0004: nothing but the visible pixels leaves the app).
// It draws through the same shape adapters as the editor canvas, so what you see is what you copy.
// The Capture is the canvas's first drawn layer (its background image), so a Blur, which pixelates
// what has been drawn beneath it, sees the Capture and every Annotation below it.
import { FabricImage, StaticCanvas } from "fabric";
import type { FinishedRenderer } from "../core/annotatedImage";
import { encodeRgbaPngCompressed } from "../core/png";
import { adapterFor } from "./shapes";

export const renderFinished: FinishedRenderer = async (image) => {
  // No colour conversion, so pixels the Annotations do not touch come out exactly as captured.
  const bitmap = await createImageBitmap(new Blob([image.capture as BlobPart], { type: "image/png" }), {
    colorSpaceConversion: "none",
  });
  const { width, height } = bitmap;
  const base = document.createElement("canvas");
  base.width = width;
  base.height = height;
  base.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();

  const element = document.createElement("canvas");
  // The pixels are read back (by a Blur while drawing, and below), so keep them on the CPU side.
  // Fabric asks the element for the same context, so it gets this one.
  const context = element.getContext("2d", { willReadFrequently: true })!;
  const canvas = new StaticCanvas(element, {
    width,
    height,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });
  canvas.backgroundImage = new FabricImage(base, { originX: "left", originY: "top" });
  for (const annotation of image.model.annotations) {
    // A type this build cannot draw is skipped, as on the editor canvas.
    const adapter = adapterFor(annotation.type);
    if (adapter) canvas.add(adapter.create(annotation));
  }
  canvas.renderAll();

  // The Crop only narrows what is shown; the Capture itself is never altered (ADR 0002).
  const area = image.model.crop ?? { x: 0, y: 0, width, height };
  const pixels = context.getImageData(area.x, area.y, area.width, area.height);
  void canvas.dispose();
  // Encoded here, not with canvas.toBlob: Chromium defers that until the page is idle (about a second
  // when the editor is busy), which would make every Copy and auto-save feel slow.
  return encodeRgbaPngCompressed(pixels.width, pixels.height, new Uint8Array(pixels.data.buffer));
};
