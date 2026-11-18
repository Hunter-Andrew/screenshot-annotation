// The visible area of an Annotated Image (tickets 21 and 37). Pure TypeScript.
//
// `model.crop` is the visible area: a rectangle in Capture pixels. Smaller than the Capture it is a
// Crop; larger (or reaching past an edge) it is canvas expansion, and what lies outside the Capture is
// filled with the image's `background`. One field, one render path. Everything that turns a gesture
// into a change of area goes through here, so the limit, the default background and the "one undo
// step" rule live in one place.
//
// Auto-grown area (M4 polish B): an Annotation drawn or moved past the edge grows the area; the model records
// the base area and which Annotations reach past it (`areaBase`, `grownBy`), and the area is always the base plus
// their extents. So it follows them back in (resized, moved inside, deleted) but never below the base. Setting
// the area explicitly (the Crop tool) makes it the final base and clears the record.
import type { AnnotatedImage } from "./annotatedImage";
import type { AnnotationType, Background, Crop, GrowCause } from "./annotation";
import { type Point, sameCrop } from "./crop";
import { type Edit, type Growth, growthOf, sameGrowth } from "./editSession";
import { readSize } from "./png";

/** The most pixels the visible area may have along one side (the same limit as a pasted image). */
export const MAX_AREA_SIDE = 8192;
export const AREA_LIMIT_MESSAGE = `The image can be at most ${MAX_AREA_SIDE} pixels on a side`;

export const BACKGROUNDS: readonly Background[] = ["white", "dark", "transparent"];
export const BACKGROUND_LABELS: Record<Background, string> = { white: "White", dark: "Dark", transparent: "Transparent" };
/** The fixed fill of the Dark background (not tied to the system theme). */
export const DARK_BACKGROUND = "#1f2937";

export const isBackground = (value: unknown): value is Background => BACKGROUNDS.includes(value as Background);

/** The CSS colour that fills the area outside the Capture, or null for Transparent (alpha 0). */
export function backgroundFill(background: Background): string | null {
  return background === "white" ? "#ffffff" : background === "dark" ? DARK_BACKGROUND : null;
}

/**
 * The kinds that never grow the visible area (Pen, Highlighter, Blur): they can be drawn, moved and resized past the
 * edge, and what lies outside is clipped from the render but stays in the Annotation (it shows again if the area is
 * widened later). Every other kind grows it.
 */
const NEVER_GROWS: readonly AnnotationType[] = ["pen", "highlight", "blur"];
export const growsArea = (type: AnnotationType): boolean => !NEVER_GROWS.includes(type);

/** The area shown and exported: the crop, or the whole Capture. */
export function visibleAreaOf(image: AnnotatedImage): Crop {
  return image.model.crop ?? { x: 0, y: 0, ...readSize(image.capture) };
}

/** True when any part of `area` lies outside a Capture of this size. */
export function extendsPastCapture(area: Crop, capture: { width: number; height: number }): boolean {
  return area.x < 0 || area.y < 0 || area.x + area.width > capture.width || area.y + area.height > capture.height;
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

/**
 * How far along one axis a span `[start, end]` must move so that, together with the span `[from, to]` it is added to, it
 * stays within the limit (an area that is already longer than the limit may not get longer): 0 when it does.
 */
function shiftAxis(from: number, to: number, start: number, end: number): number {
  const max = Math.max(MAX_AREA_SIDE, to - from);
  if (Math.max(to, end) - Math.min(from, start) <= max) return 0;
  const past = (end > to ? 1 : 0) + (start < from ? 1 : 0);
  if (past !== 1) return 0; // past both sides (longer than the limit by itself) or neither: nothing to give way to
  return start < from ? to - max - start : from + max - end;
}

/**
 * How far to move `box` (an Annotation being dragged) so that the visible area `area` plus `box` stays within the
 * 8192 px limit; 0 along an axis that already does. Drags may reach as far as that and no further (M4 fixes C).
 */
export function shiftIntoLimit(area: Crop, box: Crop): { dx: number; dy: number } {
  return {
    dx: shiftAxis(area.x, area.x + area.width, box.x, box.x + box.width),
    dy: shiftAxis(area.y, area.y + area.height, box.y, box.y + box.height),
  };
}

/** `point` held back at the limit: the furthest it may be from `area` (which it extends) with the area within 8192 px; and whether it was held back. */
export function limitPoint(area: Crop, point: Point): { point: Point; limited: boolean } {
  const { dx, dy } = shiftIntoLimit(area, { x: point.x, y: point.y, width: 0, height: 0 });
  return { point: { x: point.x + dx, y: point.y + dy }, limited: dx !== 0 || dy !== 0 };
}

/** `area` cut to the limit, keeping the edges that did not move out (compared with `previous`), and whether it was cut. */
export function limitArea(area: Crop, previous: Crop): { area: Crop; limited: boolean } {
  const [x1, x2] = limitAxis(area.x, area.x + area.width, previous.x, previous.x + previous.width);
  const [y1, y2] = limitAxis(area.y, area.y + area.height, previous.y, previous.y + previous.height);
  const limited = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  return { area: limited, limited: !sameCrop(limited, area) };
}

/** The edits that make `area` the visible area (limited to 8192 px); none when nothing would change. */
function placeArea(image: AnnotatedImage, area: Crop, defaultBackground: Background): { edits: Edit[]; limited: boolean } {
  const capture = readSize(image.capture);
  const previous = visibleAreaOf(image);
  const { area: limited, limited: wasLimited } = limitArea(area, previous);
  const crop = sameCrop(limited, { x: 0, y: 0, ...capture }) ? null : limited;
  if (sameCrop(crop, image.model.crop)) return { edits: [], limited: wasLimited };
  const edits: Edit[] = [{ kind: "setCrop", crop }];
  // The first time the area reaches past the Capture the image has no background yet: the default is stored with it.
  if (crop && extendsPastCapture(crop, capture) && image.model.background === undefined) {
    edits.push({ kind: "setBackground", background: defaultBackground });
  }
  return { edits, limited: wasLimited };
}

const asEdit = (edits: Edit[]): Edit | null => (edits.length === 0 ? null : edits.length === 1 ? edits[0]! : { kind: "batch", edits });

/**
 * The edit that makes `area` the visible area (limited to 8192 px), or null when nothing would change.
 * An area that is exactly the Capture is no crop at all. This is the user setting the area explicitly (the
 * Crop tool, Remove crop): it becomes the final base, so the record of what grew it is cleared, in the same step.
 */
export function setAreaEdit(
  image: AnnotatedImage,
  area: Crop,
  defaultBackground: Background,
): { edit: Edit | null; limited: boolean } {
  const { edits, limited } = placeArea(image, area, defaultBackground);
  if (growthOf(image.model)) edits.push({ kind: "setGrowth", growth: null });
  return { edit: asEdit(edits), limited };
}

const unionOf = (base: Crop, causes: GrowCause[]): Crop => {
  let x1 = base.x;
  let y1 = base.y;
  let x2 = base.x + base.width;
  let y2 = base.y + base.height;
  for (const { bounds } of causes) {
    x1 = Math.min(x1, bounds.x);
    y1 = Math.min(y1, bounds.y);
    x2 = Math.max(x2, bounds.x + bounds.width);
    y2 = Math.max(y2, bounds.y + bounds.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

const containedIn = (inner: Crop, outer: Crop) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/**
 * `edit` (an Annotation added, changed or deleted) together with what it does to the visible area, as one
 * edit: one undo step takes both back. `bounds` is what the Annotation covers in Capture pixels; without it
 * (a paste, a style change) the area does not follow. An Annotation that reaches outside the base area is a
 * cause of growth and the area includes it; one that moves back inside, shrinks or is deleted stops being one,
 * and the area shrinks to what the remaining causes need (never below the base).
 */
export function followAreaEdit(
  image: AnnotatedImage,
  edit: Edit,
  bounds: Crop | undefined,
  defaultBackground: Background,
): { edit: Edit; limited: boolean } {
  const id = edit.kind === "add" ? edit.annotation.id : edit.kind === "update" || edit.kind === "delete" ? edit.id : null;
  if (id === null) return { edit, limited: false };
  const type = edit.kind === "add" ? edit.annotation.type : image.model.annotations.find((a) => a.id === id)?.type;
  // A Pen, Highlighter or Blur covers what it covers but is never a cause of growth (and one that was recorded as such is dropped).
  if (type !== undefined && !growsArea(type)) bounds = undefined;
  else if (edit.kind !== "delete" && !bounds) return { edit, limited: false };
  const before = growthOf(image.model);
  const base = before?.base ?? visibleAreaOf(image);
  const causes = (before?.causes ?? []).filter((cause) => cause.id !== id);
  if (bounds && edit.kind !== "delete") {
    const x1 = Math.floor(bounds.x);
    const y1 = Math.floor(bounds.y);
    const whole = { x: x1, y: y1, width: Math.ceil(bounds.x + bounds.width) - x1, height: Math.ceil(bounds.y + bounds.height) - y1 };
    if (!containedIn(whole, base)) causes.push({ id, bounds: whole });
  }
  const after: Growth | null = causes.length > 0 ? { base, causes } : null;
  if (!before && !after) return { edit, limited: false };
  const { edits, limited } = placeArea(image, unionOf(base, causes), defaultBackground);
  if (!sameGrowth(before, after)) edits.push({ kind: "setGrowth", growth: after });
  if (edits.length === 0) return { edit, limited };
  return { edit: { kind: "batch", edits: [edit, ...edits] }, limited };
}
