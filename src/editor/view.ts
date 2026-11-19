// How the Capture sits in the editor's well: fit-to-view by default, optional zoom with scrolling.
// Pure maths (no DOM) so the fit/scroll behaviour can be tested exactly (Andrew's M1 note about
// vertical scrolling: tall Captures, window resize and switching images must feel right).
//
// The rules the Well component builds on:
//  - Fit (the default and what every newly shown image starts in) shows the whole image, scaled down
//    to the well but never enlarged past 100%, so a tall Capture needs no scrolling at all.
//  - A zoom level is kept as chosen when the window is resized; the well then scrolls.
//  - The image is centred when it is smaller than the well, and sits at the top-left (reachable by
//    scrolling) when it is bigger, never clipped.
//  - Showing another image resets to Fit with the scroll at the top-left.

export interface Size {
  width: number;
  height: number;
}

export type ViewMode = { kind: "fit" } | { kind: "zoom"; scale: number };

export const FIT: ViewMode = { kind: "fit" };

/** Space kept free around the image inside the well when no margin setting is given, in screen pixels. */
export const WELL_PADDING = 16;

const MIN_SCALE = 0.05;
const ZOOM_LADDER = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

/** The scale that shows the whole image in the well with `margin` px free on every side: shrinks to fit, never enlarges. */
export function fitScale(image: Size, well: Size, margin: number = WELL_PADDING): number {
  const availableWidth = well.width - 2 * margin;
  const availableHeight = well.height - 2 * margin;
  // The well has not been laid out yet (or is collapsed): show the image as it is.
  if (availableWidth <= 0 || availableHeight <= 0 || image.width <= 0 || image.height <= 0) return 1;
  return Math.max(MIN_SCALE, Math.min(1, availableWidth / image.width, availableHeight / image.height));
}

export function effectiveScale(mode: ViewMode, image: Size, well: Size, margin: number = WELL_PADDING): number {
  return mode.kind === "fit" ? fitScale(image, well, margin) : mode.scale;
}

/** The next zoom level up (1) or down (-1) from `scale`, which need not be on the ladder (e.g. a fitted 56.8%). */
export function zoomStep(scale: number, direction: 1 | -1): number {
  const epsilon = 1e-9;
  if (direction === 1) return ZOOM_LADDER.find((z) => z > scale + epsilon) ?? ZOOM_LADDER[ZOOM_LADDER.length - 1]!;
  return [...ZOOM_LADDER].reverse().find((z) => z < scale - epsilon) ?? ZOOM_LADDER[0]!;
}

/** Share of the visible area shown as dark margin on each side after a manual zoom, so gestures reach a quarter past it. */
const ZOOM_MARGIN_FRACTION = 0.25;

/**
 * The dark margin around the visible area, in whole screen pixels on each side. In Fit it is exactly `margin`
 * (the Canvas margin setting) on all four sides, which `fitScale` left room for, so the margin never makes the
 * well scroll. After a manual zoom it is a quarter of the area when that is more (the well scrolls to all of it,
 * and a drawing gesture or a handle can reach it all), never less than `margin`.
 */
export function marginPx(area: Size, scale: number, well: Size, mode: ViewMode, margin: number = WELL_PADDING): { x: number; y: number } {
  if (mode.kind === "fit") return { x: margin, y: margin };
  const axis = (length: number) => Math.max(margin, Math.ceil(length * scale * ZOOM_MARGIN_FRACTION));
  return { x: axis(area.width), y: axis(area.height) };
}

export interface ScrollRequest {
  image: Size;
  /** The margin around the image at `from` and at `to` (screen pixels); the default is the plain well padding. */
  padding?: { from: { x: number; y: number }; to: { x: number; y: number } };
  /** The visible part of the well (its client size). */
  view: Size;
  scroll: { left: number; top: number };
  from: number;
  to: number;
  /** Where the zoom is anchored, in the view's own pixels (0,0 = its top-left); the middle of the view when left out. */
  pointer?: { x: number; y: number };
}

/**
 * The scroll position that keeps whatever is under `pointer` (by default the middle of the view) under it after a zoom.
 * An image smaller than the view is centred, not scrolled, so it anchors on its own middle whatever the pointer.
 */
export function scrollAfterZoom({ image, view, scroll, from, to, padding, pointer }: ScrollRequest): { left: number; top: number } {
  const same = { x: WELL_PADDING, y: WELL_PADDING };
  const [before, after] = [padding?.from ?? same, padding?.to ?? same];
  const axis = (imageLength: number, viewLength: number, scrolled: number, padFrom: number, padTo: number, at: number | undefined) => {
    const oldContent = imageLength * from + 2 * padFrom;
    // Smaller than the view means it was centred, not scrolled: anchor on the image's own middle.
    if (oldContent <= viewLength) return Math.max(0, padTo + (imageLength / 2) * to - viewLength / 2);
    const held = Math.min(Math.max(at ?? viewLength / 2, 0), viewLength);
    const anchor = (scrolled + held - padFrom) / from;
    return Math.max(0, padTo + anchor * to - held);
  };
  return {
    left: axis(image.width, view.width, scroll.left, before.x, after.x, pointer?.x),
    top: axis(image.height, view.height, scroll.top, before.y, after.y, pointer?.y),
  };
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The part of the Capture that is on screen, in Capture pixels: the well's rectangle intersected with
 * the stage's (both in the same screen coordinates), divided by the zoom. Null when none of it shows.
 */
export function visibleCaptureArea(well: ScreenRect, stage: ScreenRect, scale: number): { x: number; y: number; width: number; height: number } | null {
  const left = Math.max(well.left, stage.left);
  const top = Math.max(well.top, stage.top);
  const right = Math.min(well.right, stage.right);
  const bottom = Math.min(well.bottom, stage.bottom);
  if (right <= left || bottom <= top || scale <= 0) return null;
  return { x: (left - stage.left) / scale, y: (top - stage.top) / scale, width: (right - left) / scale, height: (bottom - top) / scale };
}
