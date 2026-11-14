# Prototype: Konva vs Fabric text editing

Type: prototype
Status: resolved
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

Konva initially failed to load from cdnjs and was fixed by switching to jsDelivr in version 2.

## Answer

**Fabric.js**: Andrew tried both and prefers Fabric (2026-11-14). Its built-in on-canvas text editing (a real caret, drag-select, arrow keys) was the deciding factor.

**Notes for implementation, learned from the prototype**
- **Text:** `Textbox` with `paintFirst: 'stroke'` plus a doubled `strokeWidth` gives the outline look. Lock vertical scaling; horizontal handles change the wrap width, not the font size.
- **Callout:** Fabric can't edit text inside a `Group`. The prototype kept the `Textbox` as the selectable object and drew the box and tail as non-interactive shapes synced on move, scale and change, with a separate draggable tail handle. That works; tidy it into one Callout adapter.
- **Pixelate blur** (for later): Fabric has a built-in `Pixelate` image filter.
- **Model:** both libraries round-tripped the same app-owned model unchanged, which confirms ADR 0005. Switching libraries later stays cheap, so no separate ADR.
