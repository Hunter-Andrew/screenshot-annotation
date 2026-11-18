// The Pen's Eraser mode (pure; no canvas). An erase drag passes a circle along a path of pointer
// positions; every Pen stroke it touches is cut where the circle passed, and what is left becomes
// Pen strokes again (the model is unchanged, ADR 0005: a piece of a stroke is a stroke).
//
// A stroke point is erased when its centre-to-point distance to the eraser's path is at most the
// eraser's radius. The path is a polyline, and so is the stroke, so the test is on SEGMENTS: where the
// eraser passes between two stored points (or between two sampled pointer positions) the stroke is cut
// at the exact place the circle's edge crosses it, and new end points are made there.
//
// Pieces: a leftover that travels less than MIN_PIECE (the distance under which the Pen itself makes a
// dot, see `fromPath`) is dropped, not turned into a dot: a speck beside the hole would only look like
// debris. Every kept piece has at least two points and keeps the stroke's style.
import type { Annotation, Background } from "../annotation";
import { applyEdit, type Edit } from "../editSession";
import { followAreaEdit } from "../area";
import type { AnnotatedImage } from "../annotatedImage";
import { penBounds, type PenAnnotation } from "./pen";
import type { Point } from "./kind";

/** A leftover piece that travels less than this (px) is dropped; it matches the Pen's own click-versus-stroke limit. */
export const MIN_PIECE = 4;

type Interval = [number, number];

/** The `t` range (0..1) of segment A->B that lies within `r` of segment P->Q (the eraser's capsule), or null. */
function capsuleInterval(a: Point, b: Point, p: Point, q: Point, r: number): Interval | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const parts: Interval[] = [];

  const disc = (c: Point) => {
    const fx = a.x - c.x;
    const fy = a.y - c.y;
    const qa = dx * dx + dy * dy;
    const qb = 2 * (dx * fx + dy * fy);
    const qc = fx * fx + fy * fy - r * r;
    if (qa === 0) return void (qc <= 0 && parts.push([0, 1]));
    const d = qb * qb - 4 * qa * qc;
    if (d < 0) return;
    const root = Math.sqrt(d);
    parts.push([(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]);
  };
  disc(p);
  if (p.x !== q.x || p.y !== q.y) {
    disc(q);
    // The straight part of the capsule: between the two end lines, within r of the line P-Q.
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const ux = (q.x - p.x) / length;
    const uy = (q.y - p.y) / length;
    let lo = -Infinity;
    let hi = Infinity;
    // value(t) = v0 + t * dv must lie in [min, max]
    const clip = (v0: number, dv: number, min: number, max: number) => {
      if (dv === 0) {
        if (v0 < min || v0 > max) hi = -Infinity;
        return;
      }
      const t1 = (min - v0) / dv;
      const t2 = (max - v0) / dv;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
    };
    const ax = a.x - p.x;
    const ay = a.y - p.y;
    clip(ax * ux + ay * uy, dx * ux + dy * uy, 0, length);
    clip(-ax * uy + ay * ux, -dx * uy + dy * ux, -r, r);
    if (lo <= hi) parts.push([lo, hi]);
  }
  if (parts.length === 0) return null;
  // A capsule is convex, so the line crosses it in one stretch: the parts overlap and join up.
  const lo = Math.max(0, Math.min(...parts.map((part) => part[0])));
  const hi = Math.min(1, Math.max(...parts.map((part) => part[1])));
  return lo <= hi ? [lo, hi] : null;
}

/** The stretches of segment A->B the eraser path covers, sorted and merged. */
function erasedIntervals(a: Point, b: Point, path: readonly Point[], r: number): Interval[] {
  const found: Interval[] = [];
  for (let i = 0; i < Math.max(1, path.length - 1); i++) {
    const p = path[i]!;
    const interval = capsuleInterval(a, b, p, path[i + 1] ?? p, r);
    if (interval) found.push(interval);
  }
  found.sort((x, y) => x[0] - y[0]);
  const merged: Interval[] = [];
  for (const interval of found) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

const lengthOf = (points: readonly Point[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return total;
};

/**
 * What is left of the stroke `points` after an eraser of `radius` travelled along `path` (one point: a
 * click). Null when the eraser never touched the stroke; otherwise the pieces left, in order (none when
 * nothing is left), each at least two points.
 */
export function erasePieces(points: readonly Point[], path: readonly Point[], radius: number): Point[][] | null {
  if (points.length === 0 || path.length === 0) return null;
  const pieces: Point[][] = [];
  let current: Point[] | null = null;
  let touched = false;
  const close = () => {
    if (current && lengthOf(current) >= MIN_PIECE) pieces.push(current);
    current = null;
  };

  const segments = points.length === 1 ? [[points[0]!, points[0]!] as const] : points.slice(1).map((p, i) => [points[i]!, p] as const);
  for (const [a, b] of segments) {
    const erased = erasedIntervals(a, b, path, radius);
    if (erased.length > 0) touched = true;
    const at = (t: number): Point => (t <= 0 ? { ...a } : t >= 1 ? { ...b } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    // What is kept is the complement of the erased stretches.
    const kept: Interval[] = [];
    let cursor = 0;
    for (const [lo, hi] of erased) {
      if (lo > cursor) kept.push([cursor, lo]);
      cursor = Math.max(cursor, hi);
    }
    if (cursor < 1) kept.push([cursor, 1]);
    if (kept[0]?.[0] !== 0) close();
    for (const [s, e] of kept) {
      if (e <= s) continue;
      if (current && s === 0) current.push(at(e));
      else {
        close();
        current = [at(s), at(e)];
      }
      if (e < 1) close();
    }
    if (kept.length === 0 || kept.every(([s, e]) => e <= s)) close();
  }
  close();
  return touched ? pieces : null;
}

/**
 * The one edit an erase drag makes (so one Undo step): for each Pen stroke the path touched, its first piece
 * replaces it in place (an update), further pieces are added right after it (same stacking place), and a
 * stroke with nothing left is deleted. Only Pen strokes are ever cut: not a Highlighter, shape, text, Callout,
 * Blur or pasted image. The visible area follows the cut strokes like any other edit (an area they grew shrinks back).
 * Null edit: nothing was touched.
 */
export function eraseEdit(
  image: AnnotatedImage,
  path: readonly Point[],
  radius: number,
  defaultBackground: Background,
  newId: () => string,
): { edit: Edit | null; limited: boolean } {
  const parts: Edit[] = [];
  let limited = false;
  let working = image;
  // Position in the list as it is while the parts are applied one after another.
  let shift = 0;
  const run = (edit: Edit, bounds?: ReturnType<typeof boundsOf>) => {
    const followed = followAreaEdit(working, edit, bounds, defaultBackground);
    limited ||= followed.limited;
    parts.push(...(followed.edit.kind === "batch" ? followed.edit.edits : [followed.edit]));
    working = applyEdit(working, followed.edit);
  };

  image.model.annotations.forEach((annotation: Annotation, index) => {
    if (annotation.type !== "pen") return;
    const pieces = erasePieces(annotation.points, path, radius);
    if (!pieces) return;
    if (pieces.length === 0) {
      run({ kind: "delete", id: annotation.id });
      shift -= 1;
      return;
    }
    const [first, ...rest] = pieces as [Point[], ...Point[][]];
    run({ kind: "update", id: annotation.id, patch: { points: first } }, boundsOf({ ...annotation, points: first }));
    rest.forEach((points, k) => {
      const piece: PenAnnotation = { ...annotation, id: newId(), points };
      run({ kind: "add", annotation: piece, index: index + shift + k + 1 }, boundsOf(piece));
    });
    shift += rest.length;
  });
  return { edit: parts.length === 0 ? null : { kind: "batch", edits: parts }, limited };
}

const boundsOf = (pen: PenAnnotation) => {
  const b = penBounds(pen);
  return { x: b.left, y: b.top, width: b.width, height: b.height };
};
