# Screenshot Annotation

A Windows desktop tool for taking screenshots, marking them up, copying the result, and returning to past work.

## Language

**Capture**:
The original screenshot pixels, exactly as taken from the screen. Never altered.
_Avoid_: Screenshot (in code/docs), snap, grab

**Annotation**:
One drawn element (text, arrow, line, pen stroke, box, etc.) placed on top of a Capture.
_Avoid_: Shape, markup, object

**Annotated Image**:
A Capture together with its Annotations, kept editable.
_Avoid_: Document, project, file

**Crop**:
The visible area of an Annotated Image. It narrows what is shown and exported without discarding any of the Capture. The visible area may also be larger than the Capture (canvas expansion): the Crop tool's handles and any Annotation drawn or moved past the edge make it bigger (except a Pen stroke, a Highlighter stroke and a Blur, which never grow it: what lies outside the visible area is clipped from the render but stays in the Annotation, and shows again if the area is widened), and the part outside the Capture is filled with the image's Background. An area that an Annotation grew shrinks back when that Annotation shrinks, moves inside or is deleted, but never below its base (the Capture, or the Crop the user set); setting the area explicitly with the Crop tool makes it final.
_Avoid_: Trim, cut, canvas size

**Background**:
What fills the part of an Annotated Image's visible area that lies outside the Capture: White, Dark or Transparent. Dark is the colour of the "Dark image background" Setting (`#191919` until changed): it is applied whenever the image is drawn (editor, Export), so changing it also changes images already made, and it is never stored with an image. Chosen per image; a Setting gives the one new images start with. Never part of the Capture.
_Avoid_: Canvas colour, fill, margin (the margin is the dark space the editor shows around the image, which is not exported; its size is the Canvas margin Setting, 16 px by default, 0 to 200, and the "Canvas margin during crop" Setting, 150 px by default, 0 to 400, while the Crop tool is on, when a view in Fit re-fits to it with a short glide)

**Outside**:
Everything the editor draws outside the visible area: the dark margin around it and any cropped-out part of the Capture with its Annotations. It is dimmed by the Outside-canvas darkness setting, or, when the image's "Show outside the canvas" is off, replaced by the dark fill alone. Editor only; never part of an Export.
_Avoid_: Margin (means only the space around the area), workspace

**Blur**:
An Annotation that pixelates whatever lies beneath its box, in the editor, in the Library file's visible pixels and in every Export. Pixelate-only; the Capture underneath is never altered.
_Avoid_: Redact, mosaic, soft blur

**Eraser**:
A mode of the Pen tool (chosen in its Style panel's Mode group, with a size of 4 to 100 px) that cuts away the part of a Pen stroke the pointer passes over. The stroke becomes two or more Pen strokes, a shorter one, or nothing; one drag is one Undo step. It only ever touches Pen strokes (never a Highlighter stroke, shape, text, Callout, Blur or Pasted image). It removes ink from the Annotated Image, not from the Capture.
_Avoid_: Rubber, undo brush

**Callout**:
An Annotation of boxed text with an optional pointer tail that can be dragged to point anywhere. Resizing the box never moves where the tail points. Drawing one only places the tail: the press is the tip, the release is where the tail ends and the box starts (in the box corner nearest the tip, extending away from it), at a default size that grows with the text. It may have no text: an empty Callout stays (a Text Annotation with no text is not made).
_Avoid_: Speech bubble, note

**Styled text** (run):
Part of the text of a Text or Callout that has its own size, Bold, Italic, Underline or color, chosen while editing the box with the characters selected. Each such range of characters is a run (stored in the Annotation's `runs`, the text itself stays plain) and overrides only the properties it names; the rest follows the box's Font. Characters are selected with the keyboard or the mouse (a drag, a double-click on a word) and the Font controls then change only them; with a caret only they change the whole box. Alignment and the Text outline always belong to the whole box. A change of the whole box's size, Bold, Italic, Underline or color clears that property on every run, so "make everything 24 px" does what it says. A bigger run makes its line taller.
_Avoid_: Rich text (in code and docs), span, formatting, mixed font

**Pasted image**:
A picture pasted from the clipboard into an Annotated Image as an Annotation of its own, which can be moved, resized, given a border and made translucent. It is not part of the Capture.
_Avoid_: Sticker, overlay image

**Library**:
The collection of every Annotated Image the user has made.
_Avoid_: History, gallery

**Library Strip**:
The horizontal row of Annotated Image thumbnails along the bottom of the editor; one of two views of the Library (the other is the full grid). A chevron on its top edge collapses it to a thin bar and expands it again; the choice is kept between launches.
_Avoid_: Tray (means the Windows system tray), filmstrip, recent captures

**Delay timer**:
Taking a Capture after a wait of 3, 5 or 10 seconds, started from the tray menu or the editor's top bar, so menus and tooltips can be opened first. A countdown badge follows the mouse pointer and is not part of the Capture.
_Avoid_: Timer capture, scheduled capture

**Laser pointer**:
The feature that shows an audience where the mouse is during a demo or screen share, and the mark it draws in place of the mouse pointer: a small bright core with a soft haze and a thin ring, red by default (colour, size and the click ripple are Settings). While it is on, in laser pointer mode, it follows the mouse over the whole desktop, in every app. Switched on and off by its own global hotkey (default Alt+P), the tray item or the editor's toggle; off at every start. It is hidden from Captures, is not an Annotation and is never part of an Annotated Image.
_Avoid_: Pointer highlight, laser dot, pointer dot, cursor highlight, spotlight

**Drawing mode**:
A temporary state, started and ended by its own global hotkey (default Alt+D), in which the user draws arrows, rectangles, pen strokes and highlighter strokes over the live desktop for an audience. Nothing is saved; leaving the mode clears every drawing. A Capture taken during it includes the drawings. Its drawings are not Annotations and never reach the Library.
_Avoid_: Screen annotation, whiteboard, markup mode

**Export**:
The flattened image produced from an Annotated Image for use outside the app (clipboard or Save as). It is a plain image that never carries the editable data or the original Capture.
_Avoid_: Render, output
