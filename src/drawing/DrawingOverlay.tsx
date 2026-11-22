import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Point } from "../core/annotations";
import type { PlatformBridge } from "../platform/bridge";
import {
  clampToMonitor,
  clear,
  commit,
  commitErase,
  drawingFromGesture,
  eraseDrawings,
  initialDrawingState,
  redo,
  selectTool,
  undo,
  type DrawingState,
  type DrawingTool,
} from "./drawingState";
import { drawingKeyAction } from "./drawingKeys";
import { readDrawingStyles, readEraserSize, type DrawingStyles } from "./drawingStyles";
import { DEFAULT_ERASER_SIZE } from "../core/propertyGroups";
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
 * The Eraser cuts the Pen strokes it passes over (never the other drawings), with the eraser size saved in the editor.
 *
 * Keys (fixed, plain in-window key events, so they only work while this window has keyboard focus and
 * can never type into another app): A, R, P, H, E, Ctrl+Z, Ctrl+Y, Esc. See `drawingKeys.ts`.
 */
export function DrawingOverlay({ bridge, monitor }: { bridge: PlatformBridge; monitor: number }) {
  const [state, setState] = useState<DrawingState>(initialDrawingState);
  const [styles, setStyles] = useState<DrawingStyles>(() => readDrawingStyles({}));
  const [size, setSize] = useState(physicalSize);
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE);
  const [gesture, setGesture] = useState<Point[] | null>(null);
  /** Where the pointer is (physical pixels), for the Eraser's outline circle; null when it is outside the window. */
  const [hover, setHover] = useState<Point | null>(null);
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
    // The Highlighter's opacity is its own setting (the editor's multiplies, a transparent overlay cannot).
    const opacity = bridge.getDrawingHighlighterOpacity().catch((e) => {
      void bridge.logOverlay(`drawing ${monitor}: getDrawingHighlighterOpacity failed: ${e}`);
      return undefined;
    });
    bridge.getToolStyles().then(
      async (raw) => {
        const percent = await opacity;
        if (!alive) return;
        setStyles(readDrawingStyles(raw, percent));
        setEraserSize(readEraserSize(raw));
      },
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

  // The toolbar (its own window) and the other overlays share one tool while the mode is on: a change is relayed through the platform. Every start is Arrow.
  const logFailure = (what: string) => (e: unknown) => void bridge.logOverlay(`drawing ${monitor}: ${what} failed: ${e}`);
  const undoRequest = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    const offs: (() => void)[] = [];
    const keep = (subscription: Promise<() => void>) =>
      void subscription.then(
        (off) => (alive ? offs.push(off) : off()),
        (e) => void bridge.logOverlay(`drawing ${monitor}: subscribing failed: ${e}`),
      );
    keep(
      bridge.onDrawingTool((tool) => {
        if (alive) setState((s) => selectTool(s, tool));
      }),
    );
    keep(bridge.onDrawingUndo((target) => alive && target === monitor && undoRequest.current()));
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `logFailure` only closes over `bridge` and `monitor`.
  }, [bridge, monitor]);

  const report = (edit: "commit" | "undo" | "redo") => bridge.sendDrawingEdit({ monitor, edit }).catch(logFailure("sendDrawingEdit"));
  const undoLast = () => {
    if (state.drawings.length === 0) return;
    setState(undo);
    void report("undo");
  };
  const redoLast = () => {
    if (state.after.length === 0) return;
    setState(redo);
    void report("redo");
  };
  undoRequest.current = undoLast;
  const chooseTool = (tool: DrawingTool) => {
    setState((s) => selectTool(s, tool));
    bridge.setDrawingTool(tool).catch(logFailure("setDrawingTool"));
  };

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
      if (action.kind === "tool") chooseTool(action.tool);
      else if (action.kind === "undo") undoLast();
      else if (action.kind === "redo") redoLast();
      else leave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const erasing = state.tool === "eraser";
  const drawn = state.tool === "eraser" ? null : state.tool;
  const preview = gesture && drawn ? drawingFromGesture(drawn, "preview", gesture, styles, size) : null;
  // While an erase drag is going, the strokes it has touched show already cut.
  const shown = gesture && erasing ? (eraseDrawings(state.drawings, gesture, eraserSize, () => "preview") ?? state.drawings) : state.drawings;

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
    for (const drawing of shown) paintDrawing(context, drawing);
    if (preview) paintDrawing(context, preview);
    if (erasing && hover) {
      // The Eraser's circle, in its saved size: a dark ring with a white one inside it, readable on any desktop.
      context.save();
      context.lineWidth = 1;
      for (const [radius, color] of [
        [eraserSize / 2, "rgba(0,0,0,0.85)"],
        [eraserSize / 2 - 1, "rgba(255,255,255,0.95)"],
      ] as const) {
        context.strokeStyle = color;
        context.beginPath();
        context.arc(hover.x, hover.y, Math.max(radius, 0.5), 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }
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
  const onPointerMove = (event: PointerEvent) => {
    const point = at(event);
    setHover(point);
    setGesture((g) => (g ? [...g, point] : g));
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!gesture) return;
    const path = [...gesture, at(event)];
    setGesture(null);
    if (state.tool === "eraser") {
      // One drag is one Undo step; a drag that touched nothing is no step.
      const kept = eraseDrawings(state.drawings, path.map((p) => clampToMonitor(p, size)), eraserSize, () => `drawing-${monitor}-${nextId.current++}`);
      if (kept) {
        setState((s) => commitErase(s, kept));
        void report("commit");
      }
      return;
    }
    const drawing = drawingFromGesture(state.tool, `drawing-${monitor}-${nextId.current++}`, path, styles, size);
    if (drawing) {
      setState((s) => commit(s, drawing));
      void report("commit");
    }
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
      onPointerLeave={() => setHover(null)}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", cursor: erasing && hover ? "none" : "crosshair", touchAction: "none" }}
    />
  );
}
