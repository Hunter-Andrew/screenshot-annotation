// Paints one drawing of Drawing mode on a plain 2D canvas (the overlay is transparent, so none of the
// editor's Fabric machinery is loaded). The geometry is the editor's own (`arrowGeometry`, `smoothPath`,
// `fillPaint`), so an Arrow, Rectangle, Pen stroke and Highlighter stroke look as they do in the editor.
// One difference, by decision (ticket 41 decision 2): the Highlighter is a translucent fill with its
// stored opacity, because a transparent overlay cannot multiply with the desktop behind it.
import type { Annotation } from "../core/annotation";
import { arrowGeometry } from "../core/annotations/arrow";
import { smoothPath } from "../core/annotations/pen";
import { fillPaint } from "../core/propertyGroups";

export function paintDrawing(ctx: CanvasRenderingContext2D, drawing: Annotation): void {
  switch (drawing.type) {
    case "arrow": {
      const { line, heads } = arrowGeometry(drawing);
      ctx.save();
      ctx.strokeStyle = drawing.stroke.color;
      ctx.fillStyle = drawing.stroke.color;
      ctx.lineWidth = drawing.stroke.width;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
      for (const [tip, left, right] of heads) {
        ctx.beginPath();
        ctx.moveTo(tip!.x, tip!.y);
        ctx.lineTo(left!.x, left!.y);
        ctx.lineTo(right!.x, right!.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    case "rect": {
      ctx.save();
      const fill = fillPaint(drawing.fill);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(drawing.x, drawing.y, drawing.width, drawing.height);
      }
      ctx.strokeStyle = drawing.stroke.color;
      ctx.lineWidth = drawing.stroke.width;
      ctx.lineJoin = "miter";
      ctx.strokeRect(drawing.x, drawing.y, drawing.width, drawing.height);
      ctx.restore();
      return;
    }
    case "pen":
    case "highlight": {
      ctx.save();
      // The whole stroke is drawn at one opacity, so overlaps inside one stroke do not darken.
      if (drawing.type === "highlight") ctx.globalAlpha = drawing.opacity.value;
      const { color, width } = drawing.stroke;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const [first, ...rest] = drawing.points;
      if (first && rest.every((p) => p.x === first.x && p.y === first.y)) {
        // A dot (a click): a zero-length line is not reliably drawn, so fill a disc.
        ctx.arc(first.x, first.y, width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (const s of smoothPath(drawing.points)) {
          if (s.op === "M") ctx.moveTo(s.x, s.y);
          else if (s.op === "L") ctx.lineTo(s.x, s.y);
          else ctx.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    default:
      // Not one of the four tools: nothing to paint.
      return;
  }
}
