# Prototype: Konva vs Fabric text editing

Type: prototype
Status: claimed
Blocked by: 11

## Question

Which canvas library should the editor use: Konva or Fabric.js? Build two rough, equivalent browser prototypes Andrew can try side by side. Each has:
- click to add Text, type and edit it directly on the image;
- red text with a white outline, with a numeric font size;
- a Callout (box + draggable tail, toggleable);
- an Arrow;
- select, move and resize.

Andrew judges mainly the text typing and editing feel. Both should read and write the same app-defined Annotation model (ADR 0005), to show it decouples cleanly.

## Progress

Prototype built: a single page with a Konva/Fabric switch, sharing one app-owned model.
- **Live:** https://claude.ai/artifact/2wAmPKLCAnpre24qsqa2MY
- **Source:** branch `prototype/konva-vs-fabric`, `prototypes/canvas-compare/index.html` (throwaway, never merged).

Awaiting Andrew's verdict.
