---
status: accepted
---

# Annotations use an app-owned model, not the canvas library's format

The editable data embedded in each PNG (ADR 0004) describes Annotations in our own simple, versioned format: one object per Annotation with a `type` plus the shared property groups it uses (Stroke, Fill, Font, Text outline, Arrowheads, Opacity, Border, Tail, Strength). It never uses Konva's or Fabric's internal serialization. The canvas library only renders and edits this model. This keeps saved images readable if we ever swap canvas libraries, and makes adding a tool or property cheap: the flexibility Andrew asked for. The cost is a thin mapping layer between our model and the library's shapes.

## Update (2026-11-17, ticket 37)

`crop` (the visible area, a rectangle in Capture pixels) may extend past the Capture, so no code may assume it lies inside it. The model gains an optional `background` (`"white" | "dark" | "transparent"`). It is additive: no format version bump and no migration. A file without `background` loads and exports as before; the Settings default is stored with the image the first time its area is extended past the Capture. An older build opening an expanded file shows the Capture without the extension (accepted). The edit history gains two kinds of edit, `setBackground` and `batch` (several edits applied as one undo step, used so that the growth of the area and the Annotation that caused it undo together); history files written before them still read, and the history file's own format version is unchanged.
