// Connects the pure view maths (view.ts) to the well element: measures it as the window resizes,
// applies Fit/zoom, keeps the middle of the view fixed across a zoom, and starts every newly shown
// image at Fit with the scroll at the top-left (the part of Andrew's M1 note about switching images).
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { effectiveScale, FIT, scrollAfterZoom, type Size, type ViewMode, zoomStep } from "./view";

export interface WellView {
  wellRef: RefObject<HTMLElement | null>;
  scale: number;
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

/** `resetKey`: changes when a different image is shown. */
export function useWellView(image: Size | null, resetKey: unknown): WellView {
  const wellRef = useRef<HTMLElement | null>(null);
  const [well, setWell] = useState<Size>({ width: 0, height: 0 });
  const [mode, setMode] = useState<ViewMode>(FIT);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const scale = image ? effectiveScale(mode, image, well) : 1;

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
    scrollWellTo(wellRef.current, 0, 0);
  }, [resetKey]);

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
      });
      setMode({ kind: "zoom", scale: next });
    },
    [image, scale],
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
