# 12: Pen tool with smoothing

**What to build:** Andrew draws freehand with the Pen. Strokes are lightly smoothed and use the Stroke group.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] P shortcut
- [x] Pen strokes round-trip through the model

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15 (Claude, implementation):

- Model: `PenAnnotation { id, type: "pen", points: Point[], stroke }` in `src/core/annotations/pen.ts`. The stored points are the captured ones thinned by `decimate` (points under 2 px from the last kept one are dropped); no Fabric path is stored (ADR 0005). Smoothing is `smoothPath` (quadratic curve through midpoints, inner points as control points, exact start and end), pure and unit-tested. `PenShape` draws it, and the Export renderer draws through the same shape, so canvas and Export share one smoothing.
- Shared-file changes (small and additive): `AnnotationKind` gained an optional `fromPath(id, points, style)` for freehand tools (the canvas prefers it to `fromDrag` and now keeps the pointer path during a drag); one line each in `annotation.ts` (import, re-export, union member), `annotations/index.ts` and `shapes/index.ts`. A click or a stroke under 4 px of travel draws nothing.
- Pen strokes have no handles; they can be selected and moved (hit-tested on the drawn pixels, with the canvas's 6 px tolerance) and restyled with the Stroke group.
- Verified on Linux: vitest (234 pass; `src/core/annotations/pen.test.ts` covers decimation, smoothing, the kind, bounds, encode/decode round trip and restyle), Playwright with real Fabric (`e2e/pen.spec.ts`; 37 e2e tests pass in all): P draws, stored as points, move, restyle, reload and still editable; click draws nothing; Copy has the stroke burned in at exact pixels with no `snAP` chunk; the renderer rounds a corner at pixel level. `tsc` clean; `rustParity.test.ts` green. No Rust was touched, so `rustc --test` and `cargo check` were not re-run.
- Not verified (Windows only, covered by the new M2 checklist items): pointer and pen feel on a real display (lag, smoothing look at real mouse sample rates, stylus or touch input), WebView2 rendering of the stroke. Pressure is ignored.

2026-11-16 (Claude, M3 testing notes): a quick click (or a twitch under 4 px) with the Pen now makes a dot at where it began, instead of nothing: two identical points, drawn as a filled disc as wide as the stroke (a zero-length round-capped line is not painted reliably by every canvas, so `PenShape` fills a circle explicitly; the Export uses the same shape). It is selectable, movable and restylable like any stroke. Replaces the earlier "a click draws nothing" behavior and test.
