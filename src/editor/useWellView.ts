// Connects the pure view maths (view.ts) to the well element: measures it as the window resizes,
// applies Fit/zoom, keeps the middle of the view fixed across a zoom, and starts every newly shown
// image at Fit with the scroll at the top-left (the part of Andrew's M1 note about switching images).
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { effectiveScale, FIT, marginPx, scrollAfterZoom, type Size, type ViewMode, zoomStep } from "./view";

export interface WellView {
  wellRef: RefObject<HTMLElement | null>;
  scale: number;
  /** The dark margin shown around the visible area (screen pixels per side), and the well it was worked out for. */
  margin: { x: number; y: number };
  well: Size;
  mode: ViewMode;
  fit(): void;
  actualSize(): void;
  zoomIn(): void;
  zoomOut(): void;
}

function scrollWellTo(el: HTMLElement | null, left: number, top: number) {
  if (!el) return;
  el.scrollLeft = left;
  el.scrollTop = top;
}

/**
 * `image` is the size of the visible area (what Fit fits); `origin` is its top-left corner in Capture pixels.
 * `resetKey`: changes when a different image is shown.
 */
export function useWellView(image: Size | null, resetKey: unknown, origin: { x: number; y: number } = { x: 0, y: 0 }): WellView {
  const wellRef = useRef<HTMLElement | null>(null);
  const [well, setWell] = useState<Size>({ width: 0, height: 0 });
  const [mode, setMode] = useState<ViewMode>(FIT);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const scale = image ? effectiveScale(mode, image, well) : 1;
  const margin = image ? marginPx(image, scale, well, mode) : { x: 0, y: 0 };
  // Where the content sat before the last change of area, to keep what is on screen where it is after a manual zoom.
  const placed = useRef<{ origin: { x: number; y: number }; margin: { x: number; y: number }; scale: number } | null>(null);

  // Track the well's size (window resize, side panels, scrollbars appearing).
  useEffect(() => {
    const el = wellRef.current;
    if (!el) return;
    const measure = () => setWell({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A different image: back to Fit, scrolled to the top-left.
  useLayoutEffect(() => {
    setMode(FIT);
    pendingScroll.current = null;
    placed.current = null;
    scrollWellTo(wellRef.current, 0, 0);
  }, [resetKey]);

  // The visible area grew (auto-grow, a handle drag) or shrank while zoomed by hand: the view does not move on
  // its own, so whatever was on screen stays where it was. In Fit the view re-fits instead.
  useLayoutEffect(() => {
    const before = placed.current;
    placed.current = { origin, margin, scale };
    const el = wellRef.current;
    if (!before || !el || mode.kind !== "zoom" || before.scale !== scale) return;
    const dx = margin.x - before.margin.x + (before.origin.x - origin.x) * scale;
    const dy = margin.y - before.margin.y + (before.origin.y - origin.y) * scale;
    if (dx !== 0 || dy !== 0) scrollWellTo(el, el.scrollLeft + dx, el.scrollTop + dy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.x, origin.y, margin.x, margin.y]);

  // Apply the scroll position a zoom asked for, once the well has its new content size.
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    pendingScroll.current = null;
    if (target) scrollWellTo(wellRef.current, target.left, target.top);
  }, [scale]);

  const zoomTo = useCallback(
    (next: number) => {
      const el = wellRef.current;
      if (!el || !image || next === scale) return;
      pendingScroll.current = scrollAfterZoom({
        image,
        view: { width: el.clientWidth, height: el.clientHeight },
        scroll: { left: el.scrollLeft, top: el.scrollTop },
        from: scale,
        to: next,
        padding: { from: margin, to: marginPx(image, next, well, { kind: "zoom", scale: next }) },
      });
      setMode({ kind: "zoom", scale: next });
    },
    [image, scale, margin, well],
  );

  const zoomInRef = useRef<() => void>(() => {});
  const zoomOutRef = useRef<() => void>(() => {});
  zoomInRef.current = () => zoomTo(zoomStep(scale, 1));
  zoomOutRef.current = () => zoomTo(zoomStep(scale, -1));

  // Ctrl + wheel zooms (and must not zoom the whole window, which the webview would otherwise do).
  useEffect(() => {
    const el = wellRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (event.deltaY < 0) zoomInRef.current();
      else if (event.deltaY > 0) zoomOutRef.current();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return {
    wellRef,
    scale,
    margin,
    well,
    mode,
    fit: () => {
      pendingScroll.current = { left: 0, top: 0 };
      setMode(FIT);
    },
    actualSize: () => zoomTo(1),
    zoomIn: () => zoomInRef.current(),
    zoomOut: () => zoomOutRef.current(),
  };
}
