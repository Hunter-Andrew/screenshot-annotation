import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AnnotatedImage,
  createFromCapture,
  encodeLibraryPng,
  exportPng,
} from "../core/annotatedImage";
import type { PlatformBridge } from "../platform/bridge";
import { formatStamp } from "../shared/stamp";
import { formatCombo } from "../settings/hotkey";

/** An image opened in this session. `path` is its Library file once saved (null while saving, or if saving failed). */
interface Entry {
  id: number;
  image: AnnotatedImage;
  capturedAt: Date;
  path: string | null;
  saving: boolean;
}

/** The editor window. M1: shows the Capture, saves it to the Library, and copies the Export. */
export function Editor({ bridge }: { bridge: PlatformBridge }) {
  // Images taken this session; the newest is shown. Discard falls back to the one before it
  // (browsing the whole Library arrives with M3).
  const [entries, setEntries] = useState<Entry[]>([]);
  const current = entries.at(-1) ?? null;
  const image = current?.image ?? null;
  const nextId = useRef(0);
  const [status, setStatus] = useState<string | null>(null);
  // The real capture hotkey, for the empty-state hint; null until the platform has answered.
  const [hotkey, setHotkey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bridge.getHotkey().then(
      (state) => !cancelled && setHotkey(state.accelerator),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void bridge
      .onCapture(async (capture) => {
        const created = createFromCapture(capture.png);
        const id = nextId.current++;
        setEntries((all) => [...all, { id, image: created, capturedAt: capture.capturedAt, path: null, saving: true }]);
        setStatus("Saving…");
        try {
          // Saved the moment it is taken (spec story 86), in the final format (ADR 0004).
          const path = await bridge.saveToLibrary(encodeLibraryPng(created), capture.capturedAt);
          setEntries((all) => all.map((e) => (e.id === id ? { ...e, path, saving: false } : e)));
          setStatus(`Saved to ${path}`);
        } catch (e) {
          setEntries((all) => all.map((x) => (x.id === id ? { ...x, saving: false } : x)));
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

  const saveAs = async () => {
    if (!current) return;
    try {
      // A plain Export (ADR 0004): never the Library file, which carries the Capture.
      const path = await bridge.savePngAs(exportPng(current.image), `${formatStamp(current.capturedAt)}.png`);
      if (path !== null) setStatus(`Saved a copy to ${path}`);
    } catch (e) {
      setStatus(`Could not save: ${String(e)}`);
    }
  };

  const discard = async () => {
    if (!current) return;
    if (current.saving) {
      setStatus("Still saving to the Library; try again in a moment");
      return;
    }
    try {
      if (current.path !== null) await bridge.discardLibraryFile(current.path);
      setEntries((all) => all.filter((e) => e.id !== current.id));
      setStatus("Discarded (moved to the Recycle Bin)");
    } catch (e) {
      setStatus(`Could not discard: ${String(e)}`);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "Delete") {
        event.preventDefault();
        void discard();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #ccc" }}>
        <strong>Screenshot Annotation</strong>
        <button onClick={() => void bridge.startCapture()}>Capture</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => void discard()} disabled={!image}>
          Discard
        </button>
        <button onClick={() => void saveAs()} disabled={!image}>
          Save as PNG…
        </button>
        <button onClick={() => void copy()} disabled={!image} style={{ fontWeight: 600 }}>
          Copy
        </button>
      </header>
      <main style={{ flex: 1, overflow: "auto", background: "#e9e9ee", padding: 16 }}>
        {imageUrl ? (
          <img src={imageUrl} alt="Capture" style={{ display: "block", maxWidth: "100%", margin: "0 auto" }} />
        ) : hotkey ? (
          <p>Press {formatCombo(hotkey)} to capture</p>
        ) : null}
      </main>
      <footer style={{ padding: "4px 16px", fontSize: 12, borderTop: "1px solid #ccc" }} role="status">
        {status}
      </footer>
    </div>
  );
}
