# Grilling: Annotation tools and their properties

Type: grilling
Status: resolved
Blocked by: 

## Question

Lock the exact v1 tool list (text, arrow, line, pen, rectangle, ellipse, highlighter, blur, step number, crop?) and each tool's editable properties and defaults. Is crop an Annotation or a property of the Annotated Image? Is blur reversible?

## Answer

Confirmed with Andrew on 2026-11-14.

**v1 tools**
- **Arrow:** straight only (permanent; no curved or elbow arrows ever). Head at one end by default, or both ends.
- **Line:** straight, no heads.
- **Pen:** freehand with light, always-on smoothing.
- **Rectangle, Ellipse:** shapes only, never hold text.
- **Text:** plain label.
- **Callout:** boxed text with a tail that can be dragged and toggled. The tail is on by default.
- **Highlighter:** freehand; Shift snaps it to a straight horizontal stroke.
- **Blur:** pixelate only (permanent decision; safest for hiding text), with a strength setting.

**Crop** is not an Annotation. It is a property of the Annotated Image that can be widened again later; the Capture is never altered (see GLOSSARY "Crop").

**Blur is reversible in storage.** The Capture keeps the original pixels; only the Export is scrambled. Accepted risk: anyone with the Library folder can see the blurred-over content. See ADR 0002.

**Shared property groups.** Each tool opts into a list of groups. The goal is flexibility: adding a tool or property later must be cheap.

| Group | Contents |
| --- | --- |
| Stroke | Color (palette of 8 + custom picker); thickness 1–30 px, presets 2/4/8 |
| Fill | None, solid, or semi-transparent with an opacity slider |
| Font | Size typed 8–200 with a dropdown of 10/12/14/18/24/32/48/72; bold; italic; Segoe UI only in v1 |
| Text outline | On/off, color, width. Text defaults to red with a white outline. |
| Arrowheads | One end or both ends |

Only Fill and Highlighter can be see-through; strokes and text are always solid.

**Behavior**
- **Sticky defaults:** each tool remembers its last-used style across restarts.
- **Editing:** any Annotation can be selected again later, including after reopening from the Library, to move, resize, restyle, edit text, delete, or reorder (bring forward / send back).

**Deferred or out of scope**
- **Step numbers:** a future phase, not this version.
- **Magnifier and spotlight.**
- **"Permanently apply blur."**
