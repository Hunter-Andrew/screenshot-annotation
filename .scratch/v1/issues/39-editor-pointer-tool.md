# 39: Editor pointer tool for demos

**What to build:** A Pointer tool in the editor's tool column. While it is selected, the mouse over the canvas shows as a coloured pointer (for demos and screen shares) and nothing is drawn or selected. The pointer colour is a configurable style (the Style panel, remembered like other tool styles, with the 8 colours, custom picker and hex field).

## Open questions (grill before building)

- Shape and size of the pointer (dot, ring, arrow); is the size configurable too?
- Does a click show a ripple/flash?
- Is it an Annotation at all (recommended: no, a view-only tool that leaves nothing in the model or the file)?
- Key for the tool (remappable once ticket 28 lands); does it return to Select on Esc?
- Does the pointer also show outside the canvas (the dark margin)?

**Blocked by:** the v1.0.0 release (M0 to M4 complete).

**Status:** needs-triage

Spec: `.scratch/snagit-clone/spec.md`. Planned for M5 (v1.1.0); requested by Andrew on 2026-11-17.
