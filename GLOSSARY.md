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
The visible area of an Annotated Image. It narrows what is shown and exported without discarding any of the Capture.
_Avoid_: Trim, cut

**Library**:
The collection of every Annotated Image the user has made.
_Avoid_: History, gallery

**Library Strip**:
The horizontal row of Annotated Image thumbnails along the bottom of the editor; one of two views of the Library (the other is the full grid).
_Avoid_: Tray (means the Windows system tray), filmstrip, recent captures

**Delay timer**:
Taking a Capture after a wait of 3, 5 or 10 seconds, started from the tray menu or the editor's top bar, so menus and tooltips can be opened first. A countdown badge follows the mouse pointer and is not part of the Capture.
_Avoid_: Timer capture, scheduled capture

**Export**:
The flattened image produced from an Annotated Image for use outside the app (clipboard or Save as). It is a plain image that never carries the editable data or the original Capture.
_Avoid_: Render, output
