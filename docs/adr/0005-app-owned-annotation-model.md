---
status: accepted
---

# Annotations use an app-owned model, not the canvas library's format

The editable data embedded in each PNG (ADR 0004) describes Annotations in our own simple, versioned format: one object per Annotation with a `type` plus the shared property groups it uses (Stroke, Fill, Font, Text outline, Arrowheads). It never uses Konva's or Fabric's internal serialization. The canvas library only renders and edits this model. This keeps saved images readable if we ever swap canvas libraries, and makes adding a tool or property cheap: the flexibility Andrew asked for. The cost is a thin mapping layer between our model and the library's shapes.
