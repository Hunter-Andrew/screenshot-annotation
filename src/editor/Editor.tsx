import { useEffect, useMemo, useState } from "react";
import {
  type AnnotatedImage,
  createFromCapture,
  encodeLibraryPng,
  exportPng,
} from "../core/annotatedImage";
import type { PlatformBridge } from "../platform/bridge";

/** The editor window. M1: shows the Capture, saves it to the Library, and copies the Export. */
export function Editor({ bridge }: { bridge: PlatformBridge }) {
  const [image, setImage] = useState<AnnotatedImage | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void bridge
      .onCapture(async (capture) => {
        const created = createFromCapture(capture.png);
        setImage(created);
        setStatus("Saving…");
        try {
          // Saved the moment it is taken (spec story 86), in the final format (ADR 0004).
          const path = await bridge.saveToLibrary(encodeLibraryPng(created), capture.capturedAt);
          setStatus(`Saved to ${path}`);
        } catch (e) {
          setStatus(`Could not save to the Library: ${String(e)}`);
        }
      })
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [bridge]);

  const imageUrl = useMemo(
    () => (image ? URL.createObjectURL(new Blob([image.capture as BlobPart], { type: "image/png" })) : null),
    [image],
  );
  useEffect(() => () => (imageUrl ? URL.revokeObjectURL(imageUrl) : undefined), [imageUrl]);

  const copy = async () => {
    if (!image) return;
    try {
      await bridge.copyImage(exportPng(image));
      setStatus("Copied");
    } catch (e) {
      setStatus(`Could not copy: ${String(e)}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #ccc" }}>
        <strong>Screenshot Annotation</strong>
        <button onClick={() => void bridge.startCapture()}>Capture</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => void copy()} disabled={!image} style={{ fontWeight: 600 }}>
          Copy
        </button>
      </header>
      <main style={{ flex: 1, overflow: "auto", background: "#e9e9ee", padding: 16 }}>
        {imageUrl ? (
          <img src={imageUrl} alt="Capture" style={{ display: "block", maxWidth: "100%", margin: "0 auto" }} />
        ) : (
          <p>Press Ctrl+Shift+S to capture</p>
        )}
      </main>
      <footer style={{ padding: "4px 16px", fontSize: 12, borderTop: "1px solid #ccc" }} role="status">
        {status}
      </footer>
    </div>
  );
}
