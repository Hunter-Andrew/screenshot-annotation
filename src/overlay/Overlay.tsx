import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  dragRect,
  isClick,
  magnifierPlacement,
  sizeLabel,
  toPhysicalRegion,
  windowAt,
  type Point,
  type Rect,
} from "../capture/selection";
import type { OverlayFrame, OverlayOutcome, OverlayRect, PlatformBridge } from "../platform/bridge";

/** Magnifier: `SOURCE` native pixels around the pointer, shown `ZOOM` times larger. */
const SOURCE = 15;
const ZOOM = 8;
const MAGNIFIER_BOX = { width: SOURCE * ZOOM, height: SOURCE * ZOOM };

const viewportSize = () => ({ width: window.innerWidth, height: window.innerHeight });

const fill: CSSProperties = { position: "fixed", inset: 0 };

/**
 * One capture overlay window: the frozen frame of one monitor stretched over the whole window.
 * Drag to select (the region stops at this monitor's edge) and release to capture at once;
 * hover highlights the window under the pointer and a click captures its visible rectangle;
 * Space takes the whole monitor under the mouse pointer, Esc cancels, M toggles the magnifier.
 * Mouse-pointer-free by construction: the frame was read with the pointer not drawn.
 */
export function Overlay({ bridge, monitor }: { bridge: PlatformBridge; monitor: number }) {
  const [frame, setFrame] = useState<OverlayFrame | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [drag, setDrag] = useState<{ start: Point; current: Point } | null>(null);
  const [magnifier, setMagnifier] = useState(false);
  const [windows, setWindows] = useState<OverlayRect[]>([]);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    let alive = true;
    void bridge.overlayFrame(monitor).then((f) => alive && setFrame(f));
    return () => {
      alive = false;
    };
  }, [bridge, monitor]);

  useEffect(() => {
    let alive = true;
    void bridge.overlayWindows(monitor).then((list) => alive && setWindows(list));
    return () => {
      alive = false;
    };
  }, [bridge, monitor]);

  const imageUrl = useMemo(
    () => (frame ? URL.createObjectURL(new Blob([frame.png as BlobPart], { type: "image/png" })) : null),
    [frame],
  );
  useEffect(() => () => (imageUrl ? URL.revokeObjectURL(imageUrl) : undefined), [imageUrl]);

  const finish = (outcome: OverlayOutcome) => {
    if (finished.current) return; // e.g. Esc during a drag, then the release
    finished.current = true;
    void bridge.finishOverlay(outcome);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish({ kind: "cancel" });
      else if (event.key === " ") {
        event.preventDefault();
        finish({ kind: "monitor" });
      } else if (event.key === "m" || event.key === "M") void bridge.toggleOverlayMagnifier();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void bridge.onOverlayMagnifier(() => setMagnifier((on) => !on)).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else off = unsubscribe;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [bridge]);

  // Paint the magnifier from the frozen image around the pointer, in native pixels.
  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!magnifier || !pointer || !frame || !image || !canvas) return;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      context = null;
    }
    if (!context) return;
    const viewport = viewportSize();
    const cx = Math.floor((pointer.x * frame.width) / viewport.width);
    const cy = Math.floor((pointer.y * frame.height) / viewport.height);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const half = Math.floor(SOURCE / 2);
    const scaleX = image.naturalWidth / frame.width;
    const scaleY = image.naturalHeight / frame.height;
    context.drawImage(
      image,
      (cx - half) * scaleX,
      (cy - half) * scaleY,
      SOURCE * scaleX,
      SOURCE * scaleY,
      0,
      0,
      MAGNIFIER_BOX.width,
      MAGNIFIER_BOX.height,
    );
    context.strokeStyle = "#e11";
    context.strokeRect(half * ZOOM + 0.5, half * ZOOM + 0.5, ZOOM, ZOOM);
  }, [magnifier, pointer, frame]);

  // The window under the pointer (native pixels in, CSS pixels out) while no drag is under way.
  const scale = frame ? { x: frame.width / viewportSize().width, y: frame.height / viewportSize().height } : null;
  const hovered =
    !drag && pointer && frame && scale ? windowAt(windows, { x: pointer.x * scale.x, y: pointer.y * scale.y }) : null;
  const hoveredWindow = hovered !== null ? windows[hovered] : null;
  const highlight: Rect | null =
    hoveredWindow && scale
      ? {
          x: hoveredWindow.x / scale.x,
          y: hoveredWindow.y / scale.y,
          width: hoveredWindow.width / scale.x,
          height: hoveredWindow.height / scale.y,
        }
      : null;

  const selection: Rect | null = highlight ?? (drag ? dragRect(drag.start, drag.current, viewportSize()) : null);
  const region = hoveredWindow ?? (
    selection && frame ? toPhysicalRegion(selection, viewportSize(), { width: frame.width, height: frame.height }) : null);

  const at = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || finished.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId); // keep tracking past the window edge
    setDrag({ start: at(event), current: at(event) });
  };
  const onPointerMove = (event: PointerEvent) => {
    setPointer(at(event));
    setDrag((d) => (d ? { ...d, current: at(event) } : d));
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!drag || !frame) return;
    if (isClick(drag.start, at(event))) {
      // A click, not a drag: take the window under the pointer, if there is one.
      const viewport = viewportSize();
      const { x, y } = at(event);
      const index = windowAt(windows, { x: (x * frame.width) / viewport.width, y: (y * frame.height) / viewport.height });
      setDrag(null);
      if (index !== null) finish({ kind: "window", monitor, window: index });
      return;
    }
    const released = toPhysicalRegion(dragRect(drag.start, at(event), viewportSize()), viewportSize(), {
      width: frame.width,
      height: frame.height,
    });
    setDrag(null);
    if (released) finish({ kind: "region", monitor, region: released });
  };

  const placement = pointer ? magnifierPlacement(pointer, viewportSize(), MAGNIFIER_BOX) : null;

  return (
    <div
      data-testid="overlay"
      style={{ ...fill, cursor: "crosshair", userSelect: "none", overflow: "hidden", background: "#000" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {imageUrl && (
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Frozen screen"
          draggable={false}
          style={{ ...fill, width: "100%", height: "100%" }}
          onLoad={() => void bridge.overlayReady(monitor)}
        />
      )}
      {/* Dim everything, or everything but the selection (the box-shadow spills outward). */}
      {selection ? (
        <div
          data-testid={highlight ? "window-highlight" : undefined}
          style={{
            position: "fixed",
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
            boxShadow: "0 0 0 100vmax rgba(0,0,0,0.5)",
            outline: "1px solid #fff",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div style={{ ...fill, background: "rgba(0,0,0,0.25)", pointerEvents: "none" }} />
      )}
      {pointer && (
        <>
          <div
            data-testid="guide-x"
            style={{ position: "fixed", top: 0, bottom: 0, left: pointer.x, width: 1, background: "rgba(255,255,255,0.6)", pointerEvents: "none" }}
          />
          <div
            data-testid="guide-y"
            style={{ position: "fixed", left: 0, right: 0, top: pointer.y, height: 1, background: "rgba(255,255,255,0.6)", pointerEvents: "none" }}
          />
        </>
      )}
      {selection && region && (
        <div
          style={{
            position: "fixed",
            left: selection.x,
            top: Math.max(selection.y - 24, 0),
            padding: "2px 6px",
            font: "12px system-ui, sans-serif",
            color: "#fff",
            background: "rgba(0,0,0,0.75)",
            pointerEvents: "none",
          }}
        >
          {sizeLabel(region)}
        </div>
      )}
      {magnifier && placement && (
        <canvas
          data-testid="magnifier"
          ref={canvasRef}
          width={MAGNIFIER_BOX.width}
          height={MAGNIFIER_BOX.height}
          style={{ position: "fixed", left: placement.x, top: placement.y, border: "2px solid #fff", pointerEvents: "none" }}
        />
      )}
    </div>
  );
}
