// The visible area of an Annotated Image (tickets 21 and 37). Pure TypeScript.
//
// `model.crop` is the visible area: a rectangle in Capture pixels. Smaller than the Capture it is a
// Crop; larger (or reaching past an edge) it is canvas expansion, and what lies outside the Capture is
// filled with the image's `background`. One field, one render path. Everything that turns a gesture
// into a change of area goes through here, so the limit, the default background and the "one undo
// step" rule live in one place.
import type { AnnotatedImage } from "./annotatedImage";
import type { Background, Crop } from "./annotation";
import { sameCrop } from "./crop";
import type { Edit } from "./editSession";
import { readSize } from "./png";

/** The most pixels the visible area may have along one side (the same limit as a pasted image). */
export const MAX_AREA_SIDE = 8192;
export const AREA_LIMIT_MESSAGE = `The image can be at most ${MAX_AREA_SIDE} pixels on a side`;

/** The dark margin around the area, as a fraction of the area's size on each side. */
export const MARGIN_FRACTION = 0.25;

export const BACKGROUNDS: readonly Background[] = ["white", "dark", "transparent"];
export const BACKGROUND_LABELS: Record<Background, string> = { white: "White", dark: "Dark", transparent: "Transparent" };
/** The fixed fill of the Dark background (not tied to the system theme). */
export const DARK_BACKGROUND = "#1f2937";

export const isBackground = (value: unknown): value is Background => BACKGROUNDS.includes(value as Background);

/** The CSS colour that fills the area outside the Capture, or null for Transparent (alpha 0). */
export function backgroundFill(background: Background): string | null {
  return background === "white" ? "#ffffff" : background === "dark" ? DARK_BACKGROUND : null;
}

/** The area shown and exported: the crop, or the whole Capture. */
export function visibleAreaOf(image: AnnotatedImage): Crop {
  return image.model.crop ?? { x: 0, y: 0, ...readSize(image.capture) };
}

/** True when any part of `area` lies outside a Capture of this size. */
export function extendsPastCapture(area: Crop, capture: { width: number; height: number }): boolean {
  return area.x < 0 || area.y < 0 || area.x + area.width > capture.width || area.y + area.height > capture.height;
}

/** How far gestures may reach: the area plus a quarter of its size on each side. */
export function reachOf(area: Crop): Crop {
  const mx = area.width * MARGIN_FRACTION;
  const my = area.height * MARGIN_FRACTION;
  return { x: area.x - mx, y: area.y - my, width: area.width + 2 * mx, height: area.height + 2 * my };
}

function limitAxis(start: number, end: number, prevStart: number, prevEnd: number): [number, number] {
  // An image that was already past the limit (a very wide Capture) is not shrunk, only stopped from growing.
  const max = Math.max(MAX_AREA_SIDE, prevEnd - prevStart);
  if (end - start <= max) return [start, end];
  const grewStart = start < prevStart;
  const grewEnd = end > prevEnd;
  if (grewStart && !grewEnd) return [end - max, end];
  if (grewEnd && !grewStart) return [start, start + max];
  const middle = Math.round((prevStart + prevEnd) / 2 - max / 2);
  const from = Math.max(start, Math.min(middle, end - max));
  return [from, from + max];
}

/** `area` cut to the limit, keeping the edges that did not move out (compared with `previous`), and whether it was cut. */
export function limitArea(area: Crop, previous: Crop): { area: Crop; limited: boolean } {
  const [x1, x2] = limitAxis(area.x, area.x + area.width, previous.x, previous.x + previous.width);
  const [y1, y2] = limitAxis(area.y, area.y + area.height, previous.y, previous.y + previous.height);
  const limited = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  return { area: limited, limited: !sameCrop(limited, area) };
}

/**
 * The edit that makes `area` the visible area (limited to 8192 px), or null when nothing would change.
 * An area that is exactly the Capture is no crop at all. The first time the area reaches past the
 * Capture the image has no background yet: the settings default is stored with it, in the same undo step.
 */
export function setAreaEdit(
  image: AnnotatedImage,
  area: Crop,
  defaultBackground: Background,
): { edit: Edit | null; limited: boolean } {
  const capture = readSize(image.capture);
  const previous = visibleAreaOf(image);
  const { area: limited, limited: wasLimited } = limitArea(area, previous);
  const crop = sameCrop(limited, { x: 0, y: 0, ...capture }) ? null : limited;
  if (sameCrop(crop, image.model.crop)) return { edit: null, limited: wasLimited };
  const setCrop: Edit = { kind: "setCrop", crop };
  if (crop && extendsPastCapture(crop, capture) && image.model.background === undefined) {
    return { edit: { kind: "batch", edits: [setCrop, { kind: "setBackground", background: defaultBackground }] }, limited: wasLimited };
  }
  return { edit: setCrop, limited: wasLimited };
}

/**
 * `edit` (an Annotation added or changed) together with the growth of the area that includes it, as one
 * edit: one undo step takes both back. `bounds` is what the Annotation covers in Capture pixels; without
 * it (a paste, a style change) nothing grows. The area only ever grows here: shrinking is Crop.
 */
export function growEdit(
  image: AnnotatedImage,
  edit: Edit,
  bounds: Crop | undefined,
  defaultBackground: Background,
): { edit: Edit; limited: boolean } {
  if (!bounds) return { edit, limited: false };
  const area = visibleAreaOf(image);
  const x1 = Math.min(area.x, Math.floor(bounds.x));
  const y1 = Math.min(area.y, Math.floor(bounds.y));
  const x2 = Math.max(area.x + area.width, Math.ceil(bounds.x + bounds.width));
  const y2 = Math.max(area.y + area.height, Math.ceil(bounds.y + bounds.height));
  const grown = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  if (sameCrop(grown, area)) return { edit, limited: false };
  const { edit: areaEdit, limited } = setAreaEdit(image, grown, defaultBackground);
  if (!areaEdit) return { edit, limited };
  return { edit: { kind: "batch", edits: [edit, ...(areaEdit.kind === "batch" ? areaEdit.edits : [areaEdit])] }, limited };
}
