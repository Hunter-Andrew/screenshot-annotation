// Pasting an image from the clipboard (ticket 38): the limits and where the image lands. Pure
// TypeScript. Nothing here resamples a picture: an image over a limit is refused, and one bigger than
// the Capture is placed smaller (its box), never re-encoded.
import { isPng, readSize } from "./png";

export const MAX_IMAGE_SIDE = 8192;
/** "About 25 MB" of PNG data per pasted image. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGES = 20;

export type PasteCheck = { ok: true; width: number; height: number } | { ok: false; message: string };

/** Whether `png` may be pasted into an image that already holds `existing` pasted images. */
export function checkPastedImage(png: Uint8Array, existing: number): PasteCheck {
  if (!isPng(png)) return { ok: false, message: "The clipboard picture could not be read as an image" };
  if (existing >= MAX_IMAGES) {
    return { ok: false, message: `An image can hold at most ${MAX_IMAGES} pasted images` };
  }
  if (png.length > MAX_IMAGE_BYTES) {
    const mb = (png.length / (1024 * 1024)).toFixed(1);
    return { ok: false, message: `That picture is ${mb} MB; the largest that can be pasted is 25 MB` };
  }
  let size: { width: number; height: number };
  try {
    size = readSize(png);
  } catch {
    return { ok: false, message: "The clipboard picture could not be read as an image" };
  }
  if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) {
    return {
      ok: false,
      message: `That picture is ${size.width} x ${size.height} px; the largest that can be pasted is ${MAX_IMAGE_SIDE} px on each side`,
    };
  }
  return { ok: true, ...size };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The box a pasted image gets, in Capture pixels: 100% of its pixel size, centred in the part of
 * `visible` (the area the well shows, in Capture pixels) that lies over the Capture, and scaled down
 * (keeping its shape) only when it is bigger than the Capture. It always lies inside the Capture.
 */
export function placeImage(image: { width: number; height: number }, capture: { width: number; height: number }, visible: Box): Box {
  const scale = Math.min(1, capture.width / image.width, capture.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const left = Math.max(0, visible.x);
  const top = Math.max(0, visible.y);
  const right = Math.min(capture.width, visible.x + visible.width);
  const bottom = Math.min(capture.height, visible.y + visible.height);
  // A view that shows none of the Capture falls back to the whole Capture.
  const area = right > left && bottom > top ? { left, top, right, bottom } : { left: 0, top: 0, right: capture.width, bottom: capture.height };
  const x = (area.left + area.right) / 2 - width / 2;
  const y = (area.top + area.bottom) / 2 - height / 2;
  return {
    x: Math.min(Math.max(x, 0), capture.width - width),
    y: Math.min(Math.max(y, 0), capture.height - height),
    width,
    height,
  };
}
