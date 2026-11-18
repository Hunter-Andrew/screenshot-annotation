// The Export renderer: the Capture with the Annotations burned in and the Crop applied, as a plain PNG
// at the Capture's native resolution (ADR 0002/0004: nothing but the visible pixels leaves the app).
// It draws through the same shape adapters as the editor canvas, so what you see is what you copy.
// The Capture is the canvas's first drawn layer (its background image), so a Blur, which pixelates
// what has been drawn beneath it, sees the Capture and every Annotation below it.
import { StaticCanvas } from "fabric";
import { type FinishedRenderer, usedImageIds } from "../core/annotatedImage";
import { backgroundFill } from "../core/area";
import { encodeRgbaPngCompressed } from "../core/png";
import { Backdrop } from "./backdrop";
import { adapterFor, type ShapeAssets } from "./shapes";

export const renderFinished: FinishedRenderer = async (image, options) => {
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

  // The visible area decides the output's size: the Crop narrows it, and an area past the Capture's
  // edges (ticket 37) widens it. What lies outside the Capture is the background, or alpha 0.
  const area = image.model.crop ?? { x: 0, y: 0, width, height };
  const element = document.createElement("canvas");
  // The pixels are read back (by a Blur while drawing, and below), so keep them on the CPU side.
  // Fabric asks the element for the same context, so it gets this one.
  const context = element.getContext("2d", { willReadFrequently: true })!;
  const canvas = new StaticCanvas(element, {
    width: area.width,
    height: area.height,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });
  // Scene coordinates are Capture pixels; the output starts at the area's corner.
  canvas.setViewportTransform([1, 0, 0, 1, -area.x, -area.y]);
  // A file with no background that somehow reaches past the Capture exports transparent, as it always did.
  canvas.backgroundImage = new Backdrop(base, area, backgroundFill(image.model.background ?? "transparent", options?.darkBackground));
  // Pasted pictures are decoded first: the canvas renders once, synchronously, and an image that is not
  // decoded yet would draw nothing.
  const pictures = new Map<string, ImageBitmap>();
  for (const id of usedImageIds(image.model)) {
    const bytes = image.images?.[id];
    if (!bytes) continue;
    try {
      pictures.set(id, await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/png" }), { colorSpaceConversion: "none" }));
    } catch {
      // A picture that cannot be decoded is left out; the rest of the image still exports.
    }
  }
  const assets: ShapeAssets = { image: (id) => pictures.get(id) };
  for (const annotation of image.model.annotations) {
    // A type this build cannot draw is skipped, as on the editor canvas.
    const adapter = adapterFor(annotation.type);
    if (adapter) canvas.add(adapter.create(annotation, assets));
  }
  canvas.renderAll();
  for (const picture of pictures.values()) picture.close();

  // The area only changes what is shown; the Capture itself is never altered (ADR 0002).
  const pixels = context.getImageData(0, 0, area.width, area.height);
  void canvas.dispose();
  // Encoded here, not with canvas.toBlob: Chromium defers that until the page is idle (about a second
  // when the editor is busy), which would make every Copy and auto-save feel slow.
  return encodeRgbaPngCompressed(pixels.width, pixels.height, new Uint8Array(pixels.data.buffer));
};
