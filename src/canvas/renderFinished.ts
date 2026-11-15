// The Export renderer: the Capture with the Annotations burned in and the Crop applied, as a plain PNG
// at the Capture's native resolution (ADR 0002/0004: nothing but the visible pixels leaves the app).
// It draws through the same shape adapters as the editor canvas, so what you see is what you copy.
import { StaticCanvas } from "fabric";
import type { FinishedRenderer } from "../core/annotatedImage";
import { adapterFor } from "./shapes";

function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error("could not encode the image"));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png"),
  );
}

export const renderFinished: FinishedRenderer = async (image) => {
  // No colour conversion, so pixels the Annotations do not touch come out exactly as captured.
  const bitmap = await createImageBitmap(new Blob([image.capture as BlobPart], { type: "image/png" }), {
    colorSpaceConversion: "none",
  });
  const { width, height } = bitmap;
  const full = document.createElement("canvas");
  full.width = width;
  full.height = height;
  const context = full.getContext("2d")!;
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

  const { crop } = image.model;
  if (!crop) return toPng(full);
  const cropped = document.createElement("canvas");
  cropped.width = crop.width;
  cropped.height = crop.height;
  cropped.getContext("2d")!.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return toPng(cropped);
};
