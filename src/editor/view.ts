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

/** Space kept free around the image inside the well, in screen pixels. */
export const WELL_PADDING = 16;

const MIN_SCALE = 0.05;
const ZOOM_LADDER = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

/** The scale that shows the whole image in the well: shrinks to fit, never enlarges. */
export function fitScale(image: Size, well: Size): number {
  const availableWidth = well.width - 2 * WELL_PADDING;
  const availableHeight = well.height - 2 * WELL_PADDING;
  // The well has not been laid out yet (or is collapsed): show the image as it is.
  if (availableWidth <= 0 || availableHeight <= 0 || image.width <= 0 || image.height <= 0) return 1;
  return Math.max(MIN_SCALE, Math.min(1, availableWidth / image.width, availableHeight / image.height));
}

export function effectiveScale(mode: ViewMode, image: Size, well: Size): number {
  return mode.kind === "fit" ? fitScale(image, well) : mode.scale;
}

/** The next zoom level up (1) or down (-1) from `scale`, which need not be on the ladder (e.g. a fitted 56.8%). */
export function zoomStep(scale: number, direction: 1 | -1): number {
  const epsilon = 1e-9;
  if (direction === 1) return ZOOM_LADDER.find((z) => z > scale + epsilon) ?? ZOOM_LADDER[ZOOM_LADDER.length - 1]!;
  return [...ZOOM_LADDER].reverse().find((z) => z < scale - epsilon) ?? ZOOM_LADDER[0]!;
}

export interface ScrollRequest {
  image: Size;
  /** The visible part of the well (its client size). */
  view: Size;
  scroll: { left: number; top: number };
  from: number;
  to: number;
}

/** The scroll position that keeps whatever is in the middle of the view in the middle after a zoom. */
export function scrollAfterZoom({ image, view, scroll, from, to }: ScrollRequest): { left: number; top: number } {
  const axis = (imageLength: number, viewLength: number, scrolled: number) => {
    const oldContent = imageLength * from + 2 * WELL_PADDING;
    // Smaller than the view means it was centred, not scrolled: anchor on the image's own middle.
    const anchor = oldContent <= viewLength ? imageLength / 2 : (scrolled + viewLength / 2 - WELL_PADDING) / from;
    return Math.max(0, WELL_PADDING + anchor * to - viewLength / 2);
  };
  return {
    left: axis(image.width, view.width, scroll.left),
    top: axis(image.height, view.height, scroll.top),
  };
}
