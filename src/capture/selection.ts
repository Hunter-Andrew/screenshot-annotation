// Pure geometry of the capture overlay. Each overlay window covers exactly one monitor, so every
// coordinate here is local to that monitor; virtual-screen (possibly negative) coordinates only
// matter to the Rust side, which positions the windows and crops (src-tauri/src/geometry.rs).

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Point, Size {}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The selection while dragging, in CSS pixels of the overlay. It is clamped to the viewport: the
 * region stops at the edge of the monitor the drag started on (pointer capture keeps reporting
 * positions beyond the window, including negative ones, when the pointer wanders onto a neighbour).
 */
export function dragRect(start: Point, current: Point, viewport: Size): Rect {
  const x0 = clamp(Math.min(start.x, current.x), 0, viewport.width);
  const y0 = clamp(Math.min(start.y, current.y), 0, viewport.height);
  const x1 = clamp(Math.max(start.x, current.x), 0, viewport.width);
  const y1 = clamp(Math.max(start.y, current.y), 0, viewport.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Convert a selection in CSS pixels to native pixels of the monitor. The overlay stretches the
 * frozen frame over its whole viewport, so the scale (the monitor's DPI scaling) is simply
 * physical size over viewport size, per axis. Edges are rounded, not sizes, so adjacent regions
 * tile exactly. Null when nothing was dragged.
 */
export function toPhysicalRegion(rect: Rect, viewport: Size, monitor: Size): Rect | null {
  const sx = monitor.width / viewport.width;
  const sy = monitor.height / viewport.height;
  const x0 = clamp(Math.round(rect.x * sx), 0, monitor.width);
  const y0 = clamp(Math.round(rect.y * sy), 0, monitor.height);
  const x1 = clamp(Math.round((rect.x + rect.width) * sx), 0, monitor.width);
  const y1 = clamp(Math.round((rect.y + rect.height) * sy), 0, monitor.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function sizeLabel(region: Size): string {
  return `${region.width} × ${region.height}`;
}

const MAGNIFIER_OFFSET = 20;

/** Top-left of the magnifier: below and right of the cursor, flipped when it would leave the viewport. */
export function magnifierPlacement(cursor: Point, viewport: Size, box: Size): Point {
  const flipX = cursor.x + MAGNIFIER_OFFSET + box.width > viewport.width;
  const flipY = cursor.y + MAGNIFIER_OFFSET + box.height > viewport.height;
  return {
    x: flipX ? cursor.x - MAGNIFIER_OFFSET - box.width : cursor.x + MAGNIFIER_OFFSET,
    y: flipY ? cursor.y - MAGNIFIER_OFFSET - box.height : cursor.y + MAGNIFIER_OFFSET,
  };
}

/**
 * The window under a point: `windows` are in native pixels local to the monitor, topmost first
 * (the platform enumerates in z-order), so the first one containing the point is the one the
 * user sees there. Edges are half-open, like pixels. Null over the bare desktop.
 */
export function windowAt(windows: readonly Rect[], point: Point): number | null {
  const index = windows.findIndex(
    (w) => point.x >= w.x && point.x < w.x + w.width && point.y >= w.y && point.y < w.y + w.height,
  );
  return index < 0 ? null : index;
}

const CLICK_TOLERANCE = 4;

/** A press and release this close together is a click (window mode), not a drag (region mode). */
export function isClick(press: Point, release: Point): boolean {
  return Math.abs(release.x - press.x) < CLICK_TOLERANCE && Math.abs(release.y - press.y) < CLICK_TOLERANCE;
}
