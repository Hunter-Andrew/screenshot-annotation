// The Fabric.js implementation of `AnnotationCanvas` (chosen in ticket 12). A transparent canvas laid
// over the Capture image: it holds one Fabric object per Annotation, built by the per-type adapters in
// ./shapes, and follows the model (`sync`). User gestures leave through `CanvasEvents` as model edits;
// the canvas never keeps state of its own that the model does not have.
import { Canvas, type FabricObject, FabricImage, Rect } from "fabric";
import { backgroundFill, growsArea, limitPoint, shiftIntoLimit } from "../core/area";
import { kindOf } from "../core/annotations";
import { erasePieces } from "../core/annotations/erase";
import { highlightKind } from "../core/annotations/highlight";
import type { Point } from "../core/annotations";
import { cropFromDrag, MIN_CROP } from "../core/crop";
import { newAnnotationId, type Annotation, type AnnotationType, type AnnotationModel, type Crop } from "../core/annotation";
import { DEFAULT_ERASER_SIZE, type Style } from "../core/propertyGroups";
import { Backdrop } from "./backdrop";
import { CropFrame, OutsideDim } from "./chrome";
import type { AnnotationCanvas, CanvasLayout, MountOptions } from "./types";
import { watchTextSelection } from "./textSelection";
import { adapterFor, ImageShape, type ShapeAssets } from "./shapes";

const SELECT = "select";
const CROP = "crop";

export function createFabricCanvas(host: HTMLElement, { events, imageUrl, layout: firstLayout }: MountOptions): AnnotationCanvas {
  let layout = firstLayout;
  let scale = 1;
  // Its own mount point, so that tearing one canvas down (React StrictMode mounts, unmounts and
  // mounts again) never removes another canvas that was mounted into the same host meanwhile.
  const mountPoint = document.createElement("div");
  Object.assign(mountPoint.style, { position: "absolute", inset: "0" });
  host.appendChild(mountPoint);
  const element = document.createElement("canvas");
  mountPoint.appendChild(element);
  // A Blur reads back what is drawn beneath it on every render, so keep the pixels on the CPU side.
  // Fabric asks the element for the same context, so it gets this one.
  element.getContext("2d", { willReadFrequently: true });
  const canvas = new Canvas(element, {
    width: layout.workspace.width,
    height: layout.workspace.height,
    selection: false, // no rubber-band multi-select: one Annotation at a time for now
    preserveObjectStacking: true,
    stopContextMenu: true,
    fireRightClick: false,
  });
  canvas.selectionKey = null; // and no Shift multi-select
  canvas.setTargetFindTolerance(6); // thin arrows stay easy to grab
  // The wrapper sits over the Capture image, which the editor lays out underneath.
  Object.assign(canvas.wrapperEl.style, { position: "absolute", left: "0", top: "0" });

  // The background fill and the Capture are the canvas's first drawn layer, under every Annotation,
  // exactly as the Export draws them: a Blur pixelates what has been drawn beneath it, which has to
  // include the Capture and the fill.
  let disposed = false;
  let backdrop: Backdrop | null = null;
  if (imageUrl) {
    FabricImage.fromURL(imageUrl).then(
      (capture) => {
        if (disposed) return;
        backdrop = new Backdrop(capture.getElement() as HTMLImageElement, layout.area, backgroundFill(layout.background, layout.darkBackground));
        canvas.backgroundImage = backdrop;
        canvas.requestRenderAll();
      },
      // The image was swapped (and its URL revoked) before this canvas could load it: it is being
      // disposed too, so there is nothing to show.
      () => undefined,
    );
  }

  let tool = SELECT;
  let drawStyle: Style = {};
  let interactive = true;
  const objectsById = new Map<string, FabricObject>();
  const idOf = new WeakMap<FabricObject, string>();
  const applied = new Map<string, Annotation>();

  // Pasted pictures (ticket 38): decoded from their PNG bytes once, shown by every image object that
  // uses them. An image object draws nothing until its bitmap is there, then the canvas redraws.
  let knownImages: Readonly<Record<string, Uint8Array>> = {};
  const bitmaps = new Map<string, ImageBitmap>();
  const decoding = new Set<string>();
  const assets: ShapeAssets = { image: (id) => bitmaps.get(id) };
  const decode = (id: string) => {
    const bytes = knownImages[id];
    if (!bytes || bitmaps.has(id) || decoding.has(id)) return;
    decoding.add(id); // kept after a failure too: a picture that does not decode is not retried on every sync
    createImageBitmap(new Blob([bytes as BlobPart], { type: "image/png" }), { colorSpaceConversion: "none" }).then(
      (bitmap) => {
        if (disposed) return bitmap.close();
        bitmaps.set(id, bitmap);
        for (const object of objectsById.values()) {
          if (object instanceof ImageShape && object.imageId === id) {
            object.bitmap = bitmap;
            object.dirty = true;
          }
        }
        canvas.requestRenderAll();
      },
      () => undefined,
    );
  };

  // Everything outside the visible area is drawn very dark, over the Annotations but under the selection handles.
  const dim = new OutsideDim();
  dim.area = layout.area;
  dim.workspace = layout.workspace;
  dim.darkness = layout.darkness;
  dim.showOutside = layout.showOutside;
  canvas.overlayImage = dim;
  canvas.controlsAboveOverlay = true;

  /**
   * How far a drag reaches (M4 fixes C): once a press has started on the canvas it follows the pointer wherever that goes
   * (Fabric tracks the document, not just the canvas element, until the button is let go), as far as the image's 8192 px
   * limit and no further. The Canvas margin only decides what is shown, not how far a drag may go.
   * `held` is whether a pointer or an Annotation was held back at the limit in the gesture in progress: the editor says so
   * in the status line when the gesture is done.
   */
  let held = false;
  /** `p` held back at the limit of the visible area extended by `anchor` (where the gesture started). */
  const reach = (p: Point, anchor?: Point): Point => {
    // A Pen, Highlighter or Blur drag never grows the area, so there is no limit to hold it to.
    if (tool !== CROP && tool !== SELECT && !growsArea(tool as AnnotationType)) return p;
    const area = layout.area;
    const base = anchor
      ? {
          x: Math.min(area.x, anchor.x),
          y: Math.min(area.y, anchor.y),
          width: Math.max(area.x + area.width, anchor.x) - Math.min(area.x, anchor.x),
          height: Math.max(area.y + area.height, anchor.y) - Math.min(area.y, anchor.y),
        }
      : area;
    const limited = limitPoint(base, p);
    held ||= limited.limited;
    return limited.point;
  };
  /** Report that the gesture just ended was held back at the limit (after its own edit, so the message stays). */
  const endGesture = () => {
    if (held) events.onLimit?.();
    held = false;
  };

  /** What `object` covers, in Capture pixels (its stroke included). */
  const boundsOf = (object: FabricObject): Crop => {
    object.setCoords();
    const { left, top, width, height } = object.getBoundingRect();
    return { x: left, y: top, width, height };
  };
  const boundsOfAnnotation = (annotation: Annotation): Crop | undefined => {
    const adapter = adapterFor(annotation.type);
    return adapter ? boundsOf(adapter.create(annotation, assets)) : undefined;
  };

  // The Crop tool's eight handles on the visible area (inward crops, outward expands).
  let frame: CropFrame | null = null;
  const showFrame = (on: boolean) => {
    if (!on) {
      if (frame) silently(() => canvas.remove(frame!));
      frame = null;
      return;
    }
    if (!frame) {
      frame = new CropFrame(layout.area);
      canvas.add(frame);
    } else frame.place(layout.area);
    const active = frame;
    silently(() => canvas.setActiveObject(active));
  };

  /** A new text box being typed into: not an Annotation until it has words (see `startTyping`). */
  let pending: FabricObject | null = null;
  /** The Font the box being typed in should show when the Style panel changes it (it is not in the model yet). */
  let restylePending: ((font: NonNullable<Style["font"]>) => void) | null = null;
  const textStyling = watchTextSelection(canvas, (selection) => events.onTextSelection?.(selection));

  // --- the Pen's Eraser mode ---------------------------------------------------------------------
  /** Eraser mode is on: the Pen tool is active and its Mode group says Eraser. */
  const erasing = () => tool === "pen" && drawStyle.eraser?.mode === "eraser";
  /** The eraser circle's radius in Capture pixels (the Style panel's size is its diameter). */
  const eraserRadius = () => (drawStyle.eraser?.size ?? DEFAULT_ERASER_SIZE) / 2;
  /** Where the pointer is over the canvas (scene pixels, not clamped), for the outline circle; null when it is off the canvas. */
  let pointer: Point | null = null;
  /**
   * An erase drag in progress. Nothing reaches the model until release; meanwhile the canvas previews: each Pen
   * stroke the eraser touched is hidden and drawn in its pieces instead (same adapter, so what you see is what is saved).
   */
  let erase: { path: Point[]; pieces: Map<string, Point[][]>; previews: Map<string, FabricObject[]>; hidden: Set<string> } | null = null;
  /** Put every stroke back as the model has it: the preview ends (a cancel, or the model's own redraw after release). */
  const clearErase = () => {
    if (!erase) return;
    for (const objects of erase.previews.values()) for (const object of objects) canvas.remove(object);
    for (const id of erase.hidden) {
      const object = objectsById.get(id);
      if (object) object.visible = true;
    }
    erase = null;
    canvas.requestRenderAll();
  };
  /** The eraser passed from `from` to `to`: cut the pieces further and redraw the strokes it touched. */
  const eraseSegment = (gesture: NonNullable<typeof erase>, from: Point, to: Point) => {
    const penAdapter = adapterFor("pen")!;
    for (const [id, annotation] of applied) {
      if (annotation.type !== "pen") continue;
      const before = gesture.pieces.get(id) ?? [annotation.points];
      let touched = false;
      const after = before.flatMap((piece) => {
        const cut = erasePieces(piece, [from, to], eraserRadius());
        touched ||= cut !== null;
        return cut ?? [piece];
      });
      if (!touched) continue;
      gesture.pieces.set(id, after);
      const original = objectsById.get(id);
      if (!original) continue;
      original.visible = false;
      gesture.hidden.add(id);
      const index = Math.max(0, canvas.getObjects().indexOf(original));
      for (const object of gesture.previews.get(id) ?? []) canvas.remove(object);
      const previews = after.map((points) => {
        const object = penAdapter.create({ ...annotation, points } as typeof annotation);
        object.set({ selectable: false, evented: false });
        return object;
      });
      gesture.previews.set(id, previews);
      canvas.insertAt(index + 1, ...previews);
    }
    canvas.requestRenderAll();
  };
  /** The Highlighter is the active tool: it shows a ring the size of its stroke instead of a cursor. */
  const highlighting = () => tool === "highlight";
  /** A ring follows the pointer: the Eraser's circle, or the Highlighter's stroke width. */
  const ringed = () => erasing() || highlighting();
  // The outline circle: a dark ring with a white one inside it, readable on any Capture, in the eraser's size at the current zoom.
  // `after:render` also fires for Fabric's overlay layer (`renderTop`, on the upper canvas). Drawing there left a ring
  // that nothing clears (Fabric only clears that layer when it drew a selection box or a brush): the stuck after-image.
  canvas.on("after:render", ({ ctx }) => {
    if (ctx !== canvas.getContext()) return;
    if (!pointer || !interactive || !ringed()) return;
    const scene = canvas.viewportTransform;
    ctx.save();
    ctx.transform(scene[0], scene[1], scene[2], scene[3], scene[4], scene[5]);
    const pixel = 1 / (canvas.getZoom() || 1);
    ctx.beginPath();
    if (highlighting()) {
      // The stroke's own width in Capture pixels (so the zoom scales it), as a thin outline in the marker's colour.
      const stroke = drawStyle.stroke ?? highlightKind.defaultStyle.stroke!;
      ctx.arc(pointer.x, pointer.y, stroke.width / 2, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 * pixel;
      ctx.strokeStyle = stroke.color;
      ctx.stroke();
    } else {
      ctx.arc(pointer.x, pointer.y, eraserRadius(), 0, Math.PI * 2);
      ctx.lineWidth = 3 * pixel;
      ctx.strokeStyle = "rgba(17, 24, 39, 0.9)";
      ctx.stroke();
      ctx.lineWidth = 1.5 * pixel;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
    ctx.restore();
  });
  canvas.upperCanvasEl.addEventListener("mouseleave", () => {
    pointer = null;
    canvas.requestRenderAll();
  });

  const refreshMode = () => {
    const drawing = interactive && tool !== SELECT;
    // While typing into a new box the pointer must reach it (to place the caret, to click away).
    const cropping = interactive && tool === CROP;
    // The Crop tool needs its handles to take the pointer; the Annotations then stay out of the way.
    canvas.skipTargetFind = !interactive || (drawing && !cropping && pending === null);
    for (const object of objectsById.values()) object.evented = !cropping;
    // The Pen's Eraser mode and the Highlighter draw their own outline circle (below) instead of a cursor.
    const cursor = drawing ? (ringed() ? "none" : "crosshair") : null;
    canvas.defaultCursor = cursor ?? "default";
    canvas.hoverCursor = cursor ?? "move";
  };

  // Only the user's own gestures are reported: what the editor itself asked for (tool change, select)
  // would otherwise echo back as events.
  let quiet = false;
  const silently = (action: () => void) => {
    quiet = true;
    try {
      action();
    } finally {
      quiet = false;
    }
  };

  canvas.on("selection:created", (e) => quiet || events.onSelect(idOf.get(e.selected[0]!) ?? null));
  canvas.on("selection:updated", (e) => quiet || events.onSelect(idOf.get(e.selected[0]!) ?? null));
  canvas.on("selection:cleared", () => quiet || events.onSelect(null));
  canvas.on("object:modified", ({ target }) => {
    if (target && target === frame) return finishHandleDrag(frame);
    const id = target && idOf.get(target);
    const annotation = id ? applied.get(id) : undefined;
    if (!id || !annotation) return;
    events.onUpdate(id, adapterFor(annotation.type)!.read(target), boundsOf(target));
    endGesture();
  });
  // An Annotation may be moved anywhere the pointer goes, until the visible area would pass the 8192 px limit.
  canvas.on("object:moving", ({ target }) => {
    if (!target || target === frame || !idOf.has(target)) return;
    const type = applied.get(idOf.get(target)!)?.type;
    if (type && !growsArea(type)) return;
    const { dx, dy } = shiftIntoLimit(layout.area, boundsOf(target));
    if (dx !== 0 || dy !== 0) {
      held = true;
      target.set({ left: target.left + dx, top: target.top + dy });
      target.setCoords();
    }
  });

  /** A handle of the Crop tool's frame was released: the dragged rectangle is the new area (a step of its own). */
  const finishHandleDrag = (dragged: CropFrame) => {
    // Wherever the pointer went (the editor stops the area at the 8192 px limit and says so).
    const area = dragged.dragged();
    // Back to the committed area at once; the editor's new layout moves the frame again if the drag counts.
    dragged.place(layout.area);
    if (area.width >= MIN_CROP && area.height >= MIN_CROP) events.onCrop(area, "handle");
    canvas.requestRenderAll();
  };

  // Drawing: press, drag (a live preview built from the same adapter), release.
  /** The points a freehand drag turns into a stroke: with Shift on a Highlighter, a straight horizontal run from the press. */
  const pathFor = (
    kind: { horizontalWithShift?: boolean },
    gesture: { from: { x: number; y: number }; path: { x: number; y: number }[] },
    to: { x: number; y: number },
    shift: boolean,
  ) => (kind.horizontalWithShift && shift ? [gesture.from, { x: to.x, y: gesture.from.y }] : gesture.path);
  let drag: { from: { x: number; y: number }; path: { x: number; y: number }[]; ghost: FabricObject | null } | null = null;
  const dropGhost = () => {
    if (drag?.ghost) canvas.remove(drag.ghost);
    if (drag) drag.ghost = null;
  };
  /** The live area of a typed-in tool (Text): a dashed rectangle, like the Rectangle tool's preview. */
  const previewArea = (gesture: NonNullable<typeof drag>, to: { x: number; y: number }) => {
    const box = {
      left: Math.min(gesture.from.x, to.x),
      top: Math.min(gesture.from.y, to.y),
      width: Math.abs(to.x - gesture.from.x),
      height: Math.abs(to.y - gesture.from.y),
    };
    // Sized so the dashes keep their on-screen size at any zoom.
    const zoom = canvas.getZoom() || 1;
    if (gesture.ghost) gesture.ghost.set(box);
    else {
      gesture.ghost = new Rect({
        ...box,
        // Fabric 7 positions by the centre unless told otherwise; the box runs from the press to the pointer.
        originX: "left",
        originY: "top",
        fill: "rgba(47, 91, 234, 0.06)",
        stroke: "#2f5bea",
        strokeWidth: 1.5 / zoom,
        strokeDashArray: [6 / zoom, 4 / zoom],
        strokeUniform: true,
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      canvas.add(gesture.ghost);
    }
    canvas.requestRenderAll();
  };
  /** A click with a typed-in tool (Text): the box appears, the user types, and it counts once it has words. */
  const startTyping = (annotation: Annotation) => {
    const adapter = adapterFor(annotation.type);
    if (!adapter?.beginEdit) return;
    const kind = kindOf(annotation.type);
    const object = adapter.create(annotation);
    pending = object;
    restylePending = (font) => adapter.update(object, { ...annotation, font } as Annotation);
    canvas.add(object);
    (object as unknown as { once(event: string, handler: () => void): void }).once("editing:exited", () => {
      const typed = { ...annotation, ...adapter.read(object) } as Annotation;
      pending = null;
      restylePending = null;
      const bounds = boundsOf(object);
      silently(() => canvas.remove(object));
      // Whether the tool then goes back to Select is the editor's call (the per-tool option, in `onCreate`).
      refreshMode();
      canvas.requestRenderAll();
      // No empty Text Annotation; a Callout stays with no text (its speech box and tail still say something).
      if ("text" in typed && (typed.text.trim() !== "" || kind?.keepsEmptyText)) events.onCreate(typed, bounds);
    });
    refreshMode();
    silently(() => canvas.setActiveObject(object));
    adapter.beginEdit(object);
    canvas.requestRenderAll();
  };

  canvas.on("mouse:down", (event) => {
    if (!interactive || tool === SELECT || pending || (event.e as MouseEvent).button > 0) return;
    // A press on one of the Crop frame's handles is Fabric's to resize, not the start of a new rectangle.
    if (event.target) return;
    held = false;
    const from = canvas.getScenePoint(event.e);
    if (erasing()) {
      erase = { path: [from], pieces: new Map(), previews: new Map(), hidden: new Set() };
      return eraseSegment(erase, from, from); // a click cuts a hole
    }
    drag = { from, path: [from], ghost: null };
  });
  canvas.on("mouse:move", (event) => {
    if (ringed() && interactive) {
      pointer = canvas.getScenePoint(event.e);
      if (highlighting()) canvas.requestRenderAll(); // the ring follows (a drag below renders anyway)
    }
    if (erasing() && interactive) {
      if (!erase) return canvas.requestRenderAll();
      const to = canvas.getScenePoint(event.e);
      const last = erase.path.at(-1)!;
      erase.path.push(to);
      return eraseSegment(erase, last, to);
    }
    // The Crop tool previews its rectangle like Text's box (same dashed preview).
    if (drag && tool === CROP) return previewArea(drag, reach(canvas.getScenePoint(event.e), drag.from));
    const kind = kindOf(tool);
    const adapter = adapterFor(tool);
    if (!drag || !kind || !adapter) return;
    const to = reach(canvas.getScenePoint(event.e), drag.from);
    // A Callout with its tail on previews the speech box and tail as they will be; other typed-in tools, a dashed area.
    const showsShape = kind.type === "callout" && drawStyle.tail?.enabled !== false;
    if (kind.typedInPlace && !showsShape) return previewArea(drag, to);
    drag.path.push(to);
    // A freehand kind (Pen) gets every point the pointer passed; the others only the two ends.
    const preview = kind.fromPath
      ? kind.fromPath("preview", pathFor(kind, drag, to, (event.e as MouseEvent).shiftKey), drawStyle)
      : kind.fromDrag("preview", drag.from, to, drawStyle, layout.area);
    if (!preview) return dropGhost();
    if (drag.ghost) adapter.update(drag.ghost, preview);
    else {
      drag.ghost = adapter.create(preview);
      drag.ghost.set({ selectable: false, evented: false });
      canvas.add(drag.ghost);
    }
    canvas.requestRenderAll();
  });
  canvas.on("mouse:up", (event) => {
    if (erase) {
      const gesture = erase;
      const to = canvas.getScenePoint(event.e);
      const last = gesture.path.at(-1)!;
      if (to.x !== last.x || to.y !== last.y) gesture.path.push(to);
      // The preview stays until the editor has applied the edit and the model is synced (no flash of the whole stroke).
      events.onErase(gesture.path, eraserRadius());
      if (gesture.hidden.size === 0) clearErase();
      return;
    }
    const gesture = drag;
    drag = null;
    if (gesture && tool === CROP) {
      if (gesture.ghost) canvas.remove(gesture.ghost);
      canvas.requestRenderAll();
      const crop = cropFromDrag(gesture.from, reach(canvas.getScenePoint(event.e), gesture.from));
      // The frame lost the selection when the press landed on empty space: its handles come back.
      showFrame(true);
      if (crop) events.onCrop(crop);
      return endGesture();
    }
    const kind = kindOf(tool);
    if (!gesture || !kind) return;
    if (gesture.ghost) canvas.remove(gesture.ghost);
    const to = reach(canvas.getScenePoint(event.e), gesture.from);
    const annotation = kind.fromPath
      ? kind.fromPath(newAnnotationId(), pathFor(kind, { ...gesture, path: [...gesture.path, to] }, to, (event.e as MouseEvent).shiftKey), drawStyle)
      : kind.fromDrag(newAnnotationId(), gesture.from, to, drawStyle, layout.area);
    canvas.requestRenderAll();
    if (!annotation) return;
    if (kind.typedInPlace) startTyping(annotation);
    else events.onCreate(annotation, boundsOfAnnotation(annotation));
    endGesture();
  });

  /** The canvas element covers the workspace; scene coordinates stay Capture pixels. */
  const applyView = () => {
    const { workspace } = layout;
    canvas.setDimensions({ width: workspace.width * scale, height: workspace.height * scale });
    canvas.setViewportTransform([scale, 0, 0, scale, -workspace.x * scale, -workspace.y * scale]);
    // The handles' screen positions come from the viewport: refresh them (the frame's hit boxes especially).
    for (const object of canvas.getObjects()) object.setCoords();
    canvas.requestRenderAll();
  };
  applyView();

  return {
    sync(model: AnnotationModel, images) {
      knownImages = images ?? knownImages;
      clearErase();
      const wanted = new Set<string>();
      for (const annotation of model.annotations) {
        const adapter = adapterFor(annotation.type);
        // A type this build cannot draw stays in the model untouched; it just is not shown.
        if (!adapter) continue;
        wanted.add(annotation.id);
        let object = objectsById.get(annotation.id);
        if (!object) {
          object = adapter.create(annotation, assets);
          objectsById.set(annotation.id, object);
          object.evented = !(interactive && tool === CROP);
          idOf.set(object, annotation.id);
          canvas.add(object);
        } else if (applied.get(annotation.id) !== annotation) {
          adapter.update(object, annotation);
        }
        applied.set(annotation.id, annotation);
        if (object instanceof ImageShape && !object.bitmap) decode(object.imageId);
      }
      for (const [id, object] of [...objectsById]) {
        if (wanted.has(id)) continue;
        silently(() => canvas.remove(object));
        objectsById.delete(id);
        applied.delete(id);
      }
      // Stacking order is the model's order (bring forward, send back, Undo of a delete): the model's
      // objects fill the bottom of the canvas back to front.
      model.annotations.forEach((annotation, index) => {
        const object = objectsById.get(annotation.id);
        if (object && canvas.getObjects()[index] !== object) canvas.moveObjectTo(object, index);
      });
      canvas.requestRenderAll();
    },
    setTool(next) {
      tool = next;
      dropGhost(); // Esc (or any tool change) during a drag cancels it
      drag = null;
      clearErase(); // an erase drag too: the strokes come back, nothing is recorded
      silently(() => canvas.discardActiveObject());
      showFrame(interactive && tool === CROP);
      refreshMode();
      canvas.requestRenderAll();
    },
    styleTextSelection: (patch) => textStyling.style(patch),
    focusText: () => textStyling.focus(),
    setDrawStyle(style) {
      drawStyle = style;
      if (style.font) restylePending?.(style.font);
      // Changing the mode (or the size) mid-gesture cancels an erase drag; the circle follows the new size.
      if (!erasing()) clearErase();
      refreshMode();
      canvas.requestRenderAll();
    },
    select(id) {
      const object = id === null ? undefined : objectsById.get(id);
      // With the Crop tool on, "nothing selected" still leaves the frame's handles up.
      const target = object ?? frame ?? undefined;
      silently(() => (target ? canvas.setActiveObject(target) : canvas.discardActiveObject()));
      canvas.requestRenderAll();
    },
    setScale(next) {
      scale = next;
      applyView();
    },
    setLayout(next: CanvasLayout) {
      layout = next;
      if (backdrop) {
        backdrop.area = next.area;
        backdrop.fill = backgroundFill(next.background, next.darkBackground);
      }
      dim.area = next.area;
      dim.workspace = next.workspace;
      dim.darkness = next.darkness;
      dim.showOutside = next.showOutside;
      applyView();
      if (frame) frame.place(next.area);
    },
    setInteractive(next) {
      interactive = next;
      if (!next) silently(() => canvas.discardActiveObject());
      showFrame(interactive && tool === CROP);
      refreshMode();
    },
    dispose() {
      disposed = true;
      erase = null;
      for (const bitmap of bitmaps.values()) bitmap.close();
      bitmaps.clear();
      void canvas.dispose();
      mountPoint.remove();
    },
  };
}
