# Grilling: UI framework and canvas library

Type: grilling
Status: resolved
Blocked by: 03

## Question

Which frontend framework (React, Svelte, Solid, or plain TypeScript) and which canvas library (Konva or Fabric.js) does the Tauri UI use? Judge by editing existing Annotations (select, move, resize, edit text), JSON serialization for re-editing, Export at native pixel ratio, blur/pixelate support, and maintainability.

## Answer

Decided with Andrew on 2026-11-14.

- **UI framework: React + TypeScript.** It works equally well with either canvas library, and it's the most common choice, so it's easiest to maintain and get help with.
- **Canvas library: not decided here.** Andrew is concerned about Konva's lack of built-in text editing on the canvas and wants to try both, so the choice moves to [Prototype: Konva vs Fabric text editing](12-konva-vs-fabric-prototype.md).
- **Our own Annotation model** (see ADR 0005). Embedded data stores app-defined Annotation objects built from the shared property groups, never a canvas library's internal format.
- **Persistent undo/redo** covers every editor change (draw, move, restyle, text edit, delete, reorder, crop):
  - **Lifetime:** it survives switching images and app restarts.
  - **Storage:** per-image history in `%LOCALAPPDATA%`, never inside the PNG, so it is never part of the Library file or an Export.
  - **Limits:** up to 200 steps per image. History is discarded if the PNG changed outside the app, deleted when its image is deleted, and auto-deleted for images not opened or edited in 2 months.
