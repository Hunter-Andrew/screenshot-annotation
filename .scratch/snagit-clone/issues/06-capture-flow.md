# Grilling: Capture flow

Type: grilling
Status: resolved
Blocked by: 

## Question

Walk through Print Screen → choose region/window/full screen → editor. Decide the overlay behavior (magnifier, dimensions, Esc to cancel), multi-monitor and mixed-DPI rules, delay timer UX, what window opens afterwards, and what happens when the editor is already open.

## Answer

Confirmed with Andrew on 2026-11-14.

**Capture**
- **One hotkey, one overlay.** The hotkey freezes all monitors and shows a single overlay with three modes: drag a region, click (hover-highlighted) a window, or press Space for the whole monitor under the cursor. Esc cancels.
- **One monitor per capture.** A region drag clamps at the edge of the starting monitor. A window straddling monitors is clipped to the clicked monitor.
- **Overlay aids:** magnifier (toggled with M), pixel dimensions, crosshair guides, and dimming outside the selection.
- **Release captures immediately.** There is no adjust step; the editor's non-destructive Crop fixes imprecise regions.
- **Window capture** is a plain rectangle of the visible on-screen pixels: no shadow, no uncovering of occluded parts.
- **The cursor is never captured.**
- **Delay timer:** 3, 5 or 10 seconds, started from the tray menu or the Library, with a countdown near the cursor before the overlay opens.

**Speed** (see ADR 0003)
- Hotkey to overlay: under 150 ms.
- Mouse release to editor showing the image: under 300 ms.
- Overlay and editor windows are kept pre-warmed and hidden while the app sits in the tray.

**After capture**
- The new Annotated Image is saved to the Library immediately and opens in the **single editor window**, replacing the current image (which is auto-saved first).
- **Discard** (also Ctrl+Delete) deletes the current image.

**Library Strip** (new glossary term)
- A horizontal row of thumbnails along the bottom of the editor showing every Annotated Image, newest on the left. About 5 fit at once, so it scrolls horizontally.
- An expand button switches to a full-window grid. The strip and the grid are two views of one Library.
- Clicking a thumbnail opens that image after auto-saving the current one.
- **Delete:** a hover ✕, or a multi-select (Ctrl/Shift+click) and the Delete key. No confirmation; items go to the Windows Recycle Bin, and an Undo notice appears for a few seconds.
