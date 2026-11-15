// The Fabric.js implementation of `AnnotationCanvas` (chosen in ticket 12). A transparent canvas laid
// over the Capture image: it holds one Fabric object per Annotation, built by the per-type adapters in
// ./shapes, and follows the model (`sync`). User gestures leave through `CanvasEvents` as model edits;
// the canvas never keeps state of its own that the model does not have.
import { Canvas, type FabricObject } from "fabric";
import { kindOf } from "../core/annotations";
import { newAnnotationId, type Annotation, type AnnotationModel } from "../core/annotation";
import type { Style } from "../core/propertyGroups";
import type { AnnotationCanvas, MountOptions } from "./types";
import { adapterFor } from "./shapes";

const SELECT = "select";

export function createFabricCanvas(host: HTMLElement, { size, events }: MountOptions): AnnotationCanvas {
  // Its own mount point, so that tearing one canvas down (React StrictMode mounts, unmounts and
  // mounts again) never removes another canvas that was mounted into the same host meanwhile.
  const mountPoint = document.createElement("div");
  Object.assign(mountPoint.style, { position: "absolute", inset: "0" });
  host.appendChild(mountPoint);
  const element = document.createElement("canvas");
  mountPoint.appendChild(element);
  const canvas = new Canvas(element, {
    width: size.width,
    height: size.height,
    selection: false, // no rubber-band multi-select: one Annotation at a time for now
    preserveObjectStacking: true,
    stopContextMenu: true,
    fireRightClick: false,
  });
  canvas.selectionKey = null; // and no Shift multi-select
  canvas.setTargetFindTolerance(6); // thin arrows stay easy to grab
  // The wrapper sits over the Capture image, which the editor lays out underneath.
  Object.assign(canvas.wrapperEl.style, { position: "absolute", left: "0", top: "0" });

  let tool = SELECT;
  let drawStyle: Style = {};
  let interactive = true;
  const objectsById = new Map<string, FabricObject>();
  const idOf = new WeakMap<FabricObject, string>();
  const applied = new Map<string, Annotation>();

  const clampToImage = (p: { x: number; y: number }) => ({
    x: Math.min(Math.max(p.x, 0), size.width),
    y: Math.min(Math.max(p.y, 0), size.height),
  });

  const refreshMode = () => {
    const drawing = interactive && tool !== SELECT;
    canvas.skipTargetFind = !interactive || drawing;
    canvas.defaultCursor = drawing ? "crosshair" : "default";
    canvas.hoverCursor = drawing ? "crosshair" : "move";
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
    const id = target && idOf.get(target);
    const annotation = id ? applied.get(id) : undefined;
    if (!id || !annotation) return;
    events.onUpdate(id, adapterFor(annotation.type)!.read(target));
  });

  // Drawing: press, drag (a live preview built from the same adapter), release.
  let drag: { from: { x: number; y: number }; path: { x: number; y: number }[]; ghost: FabricObject | null } | null = null;
  const dropGhost = () => {
    if (drag?.ghost) canvas.remove(drag.ghost);
    if (drag) drag.ghost = null;
  };
  canvas.on("mouse:down", (event) => {
    if (!interactive || tool === SELECT || (event.e as MouseEvent).button > 0) return;
    const from = clampToImage(canvas.getScenePoint(event.e));
    drag = { from, path: [from], ghost: null };
  });
  canvas.on("mouse:move", (event) => {
    const kind = kindOf(tool);
    const adapter = adapterFor(tool);
    if (!drag || !kind || !adapter) return;
    const to = clampToImage(canvas.getScenePoint(event.e));
    drag.path.push(to);
    // A freehand kind (Pen) gets every point the pointer passed; the others only the two ends.
    const preview = kind.fromPath
      ? kind.fromPath("preview", drag.path, drawStyle)
      : kind.fromDrag("preview", drag.from, to, drawStyle);
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
    const gesture = drag;
    drag = null;
    const kind = kindOf(tool);
    if (!gesture || !kind) return;
    if (gesture.ghost) canvas.remove(gesture.ghost);
    const to = clampToImage(canvas.getScenePoint(event.e));
    const annotation = kind.fromPath
      ? kind.fromPath(newAnnotationId(), [...gesture.path, to], drawStyle)
      : kind.fromDrag(newAnnotationId(), gesture.from, to, drawStyle);
    canvas.requestRenderAll();
    if (annotation) events.onCreate(annotation);
  });

  return {
    sync(model: AnnotationModel) {
      const wanted = new Set<string>();
      for (const annotation of model.annotations) {
        const adapter = adapterFor(annotation.type);
        // A type this build cannot draw stays in the model untouched; it just is not shown.
        if (!adapter) continue;
        wanted.add(annotation.id);
        let object = objectsById.get(annotation.id);
        if (!object) {
          object = adapter.create(annotation);
          objectsById.set(annotation.id, object);
          idOf.set(object, annotation.id);
          canvas.add(object);
        } else if (applied.get(annotation.id) !== annotation) {
          adapter.update(object, annotation);
        }
        applied.set(annotation.id, annotation);
      }
      for (const [id, object] of [...objectsById]) {
        if (wanted.has(id)) continue;
        silently(() => canvas.remove(object));
        objectsById.delete(id);
        applied.delete(id);
      }
      canvas.requestRenderAll();
    },
    setTool(next) {
      tool = next;
      drag = null;
      silently(() => canvas.discardActiveObject());
      refreshMode();
      canvas.requestRenderAll();
    },
    setDrawStyle(style) {
      drawStyle = style;
    },
    select(id) {
      const object = id === null ? undefined : objectsById.get(id);
      silently(() => (object ? canvas.setActiveObject(object) : canvas.discardActiveObject()));
      canvas.requestRenderAll();
    },
    setScale(scale) {
      canvas.setDimensions({ width: size.width * scale, height: size.height * scale });
      canvas.setZoom(scale);
      canvas.requestRenderAll();
    },
    setInteractive(next) {
      interactive = next;
      if (!next) silently(() => canvas.discardActiveObject());
      refreshMode();
    },
    dispose() {
      void canvas.dispose();
      mountPoint.remove();
    },
  };
}
