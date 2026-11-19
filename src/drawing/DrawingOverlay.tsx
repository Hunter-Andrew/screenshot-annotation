import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Point } from "../core/annotations";
import type { PlatformBridge } from "../platform/bridge";
import { clear, commit, drawingFromGesture, initialDrawingState, redo, selectTool, undo, type DrawingState } from "./drawingState";
import { drawingKeyAction } from "./drawingKeys";
import { readDrawingStyles, type DrawingStyles } from "./drawingStyles";
import { paintDrawing } from "./paint";

/** The window's size in physical pixels, the unit of the editor's stroke widths and of the monitor. */
function physicalSize() {
  const scale = window.devicePixelRatio || 1;
  return { width: Math.round(window.innerWidth * scale), height: Math.round(window.innerHeight * scale) };
}

/**
 * One Drawing mode overlay (ticket 52): a transparent window over one monitor that takes the mouse and
 * draws with the editor's saved style for the chosen tool. Created when the mode starts and destroyed
 * when it ends, so there is nothing to reset: the drawings live only in this page's state, and Esc (or
 * the platform ending the mode) throws them away. Each monitor has its own page, so a drawing cannot
 * span two monitors, and its points are clamped to this one.
 *
 * Keys (fixed, plain in-window key events, so they only work while this window has keyboard focus and
 * can never type into another app): A, R, P, H, Ctrl+Z, Ctrl+Y, Esc. See `drawingKeys.ts`.
 */
export function DrawingOverlay({ bridge, monitor }: { bridge: PlatformBridge; monitor: number }) {
  const [state, setState] = useState<DrawingState>(initialDrawingState);
  const [styles, setStyles] = useState<DrawingStyles>(() => readDrawingStyles({}));
  const [size, setSize] = useState(physicalSize);
  const [gesture, setGesture] = useState<Point[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextId = useRef(0);

  // The window is transparent: no page background may show, only the drawings.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
  }, []);

  // The editor's saved styles, read once when the mode starts. Unreadable settings leave the defaults.
  useEffect(() => {
    let alive = true;
    bridge.getToolStyles().then(
      (raw) => alive && setStyles(readDrawingStyles(raw)),
      (e) => void bridge.logOverlay(`drawing ${monitor}: getToolStyles failed: ${e}`),
    );
    return () => {
      alive = false;
    };
  }, [bridge, monitor]);

  // The window is placed and sized after it is created (and a monitor's scale can change): follow it.
  useEffect(() => {
    const onResize = () => setSize(physicalSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const leave = () => {
    setGesture(null);
    setState(clear);
    bridge.exitDrawingMode().catch((e) => void bridge.logOverlay(`drawing ${monitor}: exitDrawingMode failed: ${e}`));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = drawingKeyAction(event);
      if (!action) return;
      event.preventDefault();
      if (action.kind === "tool") setState((s) => selectTool(s, action.tool));
      else if (action.kind === "undo") setState(undo);
      else if (action.kind === "redo") setState(redo);
      else leave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const preview = gesture ? drawingFromGesture(state.tool, "preview", gesture, styles, size) : null;

  // Repaint: everything drawn so far, then the stroke under the pointer.
  useEffect(() => {
    const canvas = canvasRef.current;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas?.getContext("2d") ?? null;
    } catch {
      context = null;
    }
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const drawing of state.drawings) paintDrawing(context, drawing);
    if (preview) paintDrawing(context, preview);
  });

  const at = (event: PointerEvent): Point => {
    const scale = window.devicePixelRatio || 1;
    return { x: event.clientX * scale, y: event.clientY * scale };
  };
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId); // keep tracking past the window edge
    } catch {
      // Not every pointer can be captured; the points are clamped to the monitor either way.
    }
    setGesture([at(event)]);
  };
  const onPointerMove = (event: PointerEvent) => setGesture((g) => (g ? [...g, at(event)] : g));
  const onPointerUp = (event: PointerEvent) => {
    if (!gesture) return;
    const drawing = drawingFromGesture(state.tool, `drawing-${monitor}-${nextId.current++}`, [...gesture, at(event)], styles, size);
    setGesture(null);
    if (drawing) setState((s) => commit(s, drawing));
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="drawing-canvas"
      data-tool={state.tool}
      data-drawings={state.drawings.length}
      aria-label="Drawing overlay"
      width={size.width}
      height={size.height}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setGesture(null)}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", cursor: "crosshair", touchAction: "none" }}
    />
  );
}
