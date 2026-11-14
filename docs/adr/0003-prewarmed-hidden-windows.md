---
status: accepted
---

# Keep overlay and editor windows pre-warmed and hidden

Speed from hotkey to overlay (under 150 ms) and from mouse release to the editor (under 300 ms) is a core requirement. Creating a WebView2 window on demand is too slow for that, so while the app sits in the tray it keeps the capture overlay and the editor window loaded but hidden, and only shows them. The cost is a constant memory footprint of roughly 50–100 MB even when idle, which we accept.
