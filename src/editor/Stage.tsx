import { useEffect, useMemo, useRef } from "react";
import type { AnnotationCanvas, CanvasEvents, CanvasKit, CanvasLayout } from "../canvas/types";
import type { Background, Crop } from "../core/annotation";
import { backgroundFill } from "../core/area";
import type { Size } from "./view";

interface Props {
  kit: CanvasKit;
  /** The Capture, shown underneath; the canvas on top holds the Annotations and everything outside the visible area dimmed. */
  imageUrl: string;
  /** The Capture's size. */
  size: Size;
  /** The visible area in Capture pixels: smaller than the Capture (a Crop) or reaching past it (expansion). */
  area: Crop;
  /** What fills the area outside the Capture. */
  background: Background;
  /** How dark the outside of the area is drawn (percent), and whether the outside shows the Capture and Annotations at all. */
  darkness: number;
  showOutside: boolean;
  /** The dark margin shown around the area, in screen pixels per side. */
  margin: { x: number; y: number };
  scale: number;
  interactive: boolean;
  /** Read through a ref, so changing handlers never remounts the canvas. */
  events: CanvasEvents;
  /** The mounted canvas (null while it loads, and after it is torn down). */
  onCanvas(canvas: AnnotationCanvas | null): void;
}

/**
 * The visible area at the current scale: the Capture inside it, the background around the Capture, the
 * dark margin, and the annotation canvas laid over all of it. Mount one per image (`key` it by the image):
 * the canvas is created for that Capture and disposed with it.
 */
export function Stage({ kit, imageUrl, size, area, background, darkness, showOutside, margin, scale, interactive, events, onCanvas }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<AnnotationCanvas | null>(null);
  // The canvas covers the area and its margin, as Capture pixels (the margin is whole screen pixels).
  const layout = useMemo<CanvasLayout>(() => {
    const mx = margin.x / scale;
    const my = margin.y / scale;
    return {
      area,
      background,
      darkness,
      showOutside,
      workspace: { x: area.x - mx, y: area.y - my, width: area.width + 2 * mx, height: area.height + 2 * my },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.x, area.y, area.width, area.height, background, darkness, showOutside, margin.x, margin.y, scale]);
  const latest = useRef({ events, onCanvas, scale, interactive, imageUrl, layout });
  latest.current = { events, onCanvas, scale, interactive, imageUrl, layout };

  useEffect(() => {
    let cancelled = false;
    void kit
      .mount(host.current!, {
        size,
        imageUrl: latest.current.imageUrl,
        layout: latest.current.layout,
        events: {
          onCreate: (a, bounds) => latest.current.events.onCreate(a, bounds),
          onUpdate: (id, patch, bounds) => latest.current.events.onUpdate(id, patch, bounds),
          onErase: (path, radius) => latest.current.events.onErase(path, radius),
          onSelect: (id) => latest.current.events.onSelect(id),
          onCrop: (crop, how) => latest.current.events.onCrop(crop, how),
          onLimit: () => latest.current.events.onLimit?.(),
          onTextSelection: (selection) => latest.current.events.onTextSelection?.(selection),
        },
      })
      .then((mounted) => {
        if (cancelled) return mounted.dispose();
        canvas.current = mounted;
        mounted.setLayout(latest.current.layout);
        mounted.setScale(latest.current.scale);
        mounted.setInteractive(latest.current.interactive);
        latest.current.onCanvas(mounted);
      });
    return () => {
      cancelled = true;
      canvas.current?.dispose();
      canvas.current = null;
      latest.current.onCanvas(null);
    };
  }, [kit, size]);

  useEffect(() => {
    canvas.current?.setLayout(layout);
    canvas.current?.setScale(scale);
  }, [layout, scale]);
  useEffect(() => canvas.current?.setInteractive(interactive), [interactive]);

  const px = (n: number) => n * scale;
  // The picture under the canvas stands in until the canvas has loaded the Capture, and only the visible area of it
  // ever shows (the box below clips it): the outside is the canvas's (dimmed, or gone), never an undimmed Capture,
  // and a big Capture cropped small does not make the well scroll.
  const fill = backgroundFill(background);
  return (
    <div className="stage-pad" style={{ padding: `${margin.y}px ${margin.x}px` }}>
      <div className="area" style={{ width: px(area.width), height: px(area.height), background: fill ?? undefined }}>
        {fill === null && <div className="checker" aria-hidden="true" />}
        {/* The Capture's own box (what the Capture's pixels map to on screen), placed relative to the area. */}
        <div className="stage-clip">
          <div className="stage" style={{ left: px(-area.x), top: px(-area.y), width: px(size.width), height: px(size.height) }}>
            <img src={imageUrl} alt="Capture" draggable={false} />
          </div>
        </div>
        <div
          className="canvas-host"
          ref={host}
          style={{ left: -margin.x, top: -margin.y, width: px(area.width) + 2 * margin.x, height: px(area.height) + 2 * margin.y }}
        />
      </div>
    </div>
  );
}
