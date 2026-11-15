// The Export renderer: the Capture with the Annotations burned in and the Crop applied, as a plain PNG
// at the Capture's native resolution (ADR 0002/0004: nothing but the visible pixels leaves the app).
// It draws through the same shape adapters as the editor canvas, so what you see is what you copy.
import { StaticCanvas } from "fabric";
import type { FinishedRenderer } from "../core/annotatedImage";
import { encodeRgbaPngCompressed } from "../core/png";
import { adapterFor } from "./shapes";

export const renderFinished: FinishedRenderer = async (image) => {
  // No colour conversion, so pixels the Annotations do not touch come out exactly as captured.
  const bitmap = await createImageBitmap(new Blob([image.capture as BlobPart], { type: "image/png" }), {
    colorSpaceConversion: "none",
  });
  const { width, height } = bitmap;
  const full = document.createElement("canvas");
  full.width = width;
  full.height = height;
  // The pixels are read back below, so keep them on the CPU side.
  const context = full.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const overlay = new StaticCanvas(document.createElement("canvas"), {
    width,
    height,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });
  for (const annotation of image.model.annotations) {
    // A type this build cannot draw is skipped, as on the editor canvas.
    const adapter = adapterFor(annotation.type);
    if (adapter) overlay.add(adapter.create(annotation));
  }
  overlay.renderAll();
  context.drawImage(overlay.lowerCanvasEl, 0, 0);
  void overlay.dispose();

  // The Crop only narrows what is shown; the Capture itself is never altered (ADR 0002).
  const area = image.model.crop ?? { x: 0, y: 0, width, height };
  const pixels = context.getImageData(area.x, area.y, area.width, area.height);
  // Encoded here, not with canvas.toBlob: Chromium defers that until the page is idle (about a second
  // when the editor is busy), which would make every Copy and auto-save feel slow.
  return encodeRgbaPngCompressed(pixels.width, pixels.height, new Uint8Array(pixels.data.buffer));
};
