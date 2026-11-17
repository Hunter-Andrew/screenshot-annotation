import { useEffect, useRef } from "react";
import type { AnnotationCanvas, CanvasEvents, CanvasKit } from "../canvas/types";
import type { Crop } from "../core/annotation";
import type { Size } from "./view";

interface Props {
  kit: CanvasKit;
  /** The Capture, shown underneath; the canvas on top holds only the Annotations. */
  imageUrl: string;
  size: Size;
  scale: number;
  interactive: boolean;
  /** The visible area: the rest of the Capture is dimmed (it stays on screen and editable). */
  crop: Crop | null;
  /** Read through a ref, so changing handlers never remounts the canvas. */
  events: CanvasEvents;
  /** The mounted canvas (null while it loads, and after it is torn down). */
  onCanvas(canvas: AnnotationCanvas | null): void;
}

/**
 * The Capture at the current scale with the annotation canvas laid over it. Mount one per image
 * (`key` it by the image): the canvas is created for that Capture's size and disposed with it.
 */
export function Stage({ kit, imageUrl, size, scale, interactive, crop, events, onCanvas }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<AnnotationCanvas | null>(null);
  const latest = useRef({ events, onCanvas, scale, interactive });
  latest.current = { events, onCanvas, scale, interactive };

  useEffect(() => {
    let cancelled = false;
    void kit
      .mount(host.current!, {
        size,
        events: {
          onCreate: (a) => latest.current.events.onCreate(a),
          onUpdate: (id, patch) => latest.current.events.onUpdate(id, patch),
          onSelect: (id) => latest.current.events.onSelect(id),
          onCrop: (crop) => latest.current.events.onCrop(crop),
        },
      })
      .then((mounted) => {
        if (cancelled) return mounted.dispose();
        canvas.current = mounted;
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

  useEffect(() => canvas.current?.setScale(scale), [scale]);
  useEffect(() => canvas.current?.setInteractive(interactive), [interactive]);

  return (
    <div className="stage-pad">
      <div className="stage" style={{ width: size.width * scale, height: size.height * scale }}>
        <img src={imageUrl} alt="Capture" draggable={false} />
        <div className="canvas-host" ref={host} />
        {crop && (
          <div className="crop-clip" aria-hidden="true">
            <div
              className="crop-frame"
              style={{ left: crop.x * scale, top: crop.y * scale, width: crop.width * scale, height: crop.height * scale }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
