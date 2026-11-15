import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fabricKit } from "../canvas/kit";
import type { AnnotationCanvas, CanvasEvents, CanvasKit } from "../canvas/types";
import {
  type AnnotatedImage,
  createFromCapture,
  decodeLibraryPng,
  exportPng,
} from "../core/annotatedImage";
import { type Annotation, emptyModel } from "../core/annotation";
import { kindOf } from "../core/annotations";
import { createEditSession, type EditSession } from "../core/editSession";
import { readSize } from "../core/png";
import type { GroupId, PropertyGroups, Style } from "../core/propertyGroups";
import type { PlatformBridge } from "../platform/bridge";
import { capturedAtFromPath, formatStamp } from "../shared/stamp";
import { formatCombo } from "../settings/hotkey";
import "./editor.css";
import { createPersister, type Persister } from "./persister";
import { actionForKeyEvent, allowedWhileTyping, defaultBindings, isTypingTarget } from "./shortcuts";
import { Stage } from "./Stage";
import { StylePanel } from "./StylePanel";
import { SELECT_TOOL, TOOLS } from "./tools";
import { ToolColumn } from "./ToolColumn";
import { useWellView } from "./useWellView";

/** An image opened in this session: its edit session (the model), and the persister that keeps its Library file current. */
interface Entry {
  id: number;
  session: EditSession;
  persister: Persister;
  capturedAt: Date;
  /** Saved by a newer version of the app: shown, never edited or written. */
  readOnly: boolean;
}

const BINDINGS = defaultBindings(); // ticket 28 will read the user's remapping here

function useSessionImage(session: EditSession | null): AnnotatedImage | null {
  return useSyncExternalStore(
    useCallback((onChange) => session?.subscribe(onChange) ?? (() => {}), [session]),
    () => session?.image ?? null,
  );
}

/**
 * The editor window (layout A): top bar, tool column, the Capture in a neutral well, Style panel.
 * The model (an `EditSession` per image) is the source of truth; the canvas follows it and reports
 * gestures back as edits; every edit is auto-saved to the image's Library PNG.
 */
export function Editor({ bridge, kit = fabricKit }: { bridge: PlatformBridge; kit?: CanvasKit }) {
  // Images opened this session; the newest is shown. Discard falls back to the one before it
  // (browsing the whole Library arrives with M3).
  const [entries, setEntries] = useState<Entry[]>([]);
  const current = entries.at(-1) ?? null;
  const image = useSessionImage(current?.session ?? null);
  const nextId = useRef(0);
  const [status, setStatus] = useState<string | null>(null);
  // The real capture hotkey, for the empty-state hint; null until the platform has answered.
  const [hotkey, setHotkey] = useState<string | null>(null);

  const [tool, setTool] = useState(SELECT_TOOL.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Last-used style per tool (in memory for now; ticket 10 persists it across restarts).
  const [toolStyles, setToolStyles] = useState<Record<string, Style>>({});
  const [canvas, setCanvas] = useState<AnnotationCanvas | null>(null);

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

  /** A new Entry for `decoded`, with its auto-save wired to the status line. */
  const createEntry = useCallback(
    (decoded: AnnotatedImage, capturedAt: Date, options: { path?: string; readOnly?: boolean; note?: string } = {}): Entry => {
      const id = nextId.current++;
      const session = createEditSession(decoded);
      const note = options.note ?? "";
      const persister = createPersister({
        bridge,
        session,
        capturedAt,
        render: kit.render,
        path: options.path,
        readOnly: options.readOnly,
        onEvent: (event) =>
          setStatus(
            event.kind === "saved"
              ? event.first
                ? `${note}Saved to ${event.path}`
                : "All changes saved"
              : `Could not save to the Library: ${event.message}`,
          ),
      });
      session.subscribe(() => persister.markDirty());
      return { id, session, persister, capturedAt, readOnly: options.readOnly === true };
    },
    [bridge, kit],
  );

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      // First reopen the last image, so edits survive a restart. Before subscribing to Captures: a
      // Capture that is saved later can then never be mistaken for it.
      try {
        const file = await bridge.openLatestLibraryImage();
        if (file && !cancelled) {
          const decoded = decodeLibraryPng(file.png);
          const entry = createEntry(decoded, capturedAtFromPath(file.path) ?? new Date(), {
            path: file.path,
            readOnly: decoded.readOnly,
          });
          setEntries((all) => [entry, ...all]);
          if (decoded.readOnly) {
            setStatus("Opened read-only: it was saved by a newer version of Screenshot Annotation");
          }
        }
      } catch (e) {
        setStatus(`Could not open the last image: ${String(e)}`);
      }
      if (cancelled) return;
      const off = await bridge.onCapture(async (capture) => {
        // The platform already copied this plain Capture once (never redone here); just report it.
        const note =
          capture.clipboard === "copied"
            ? "Copied to clipboard. "
            : capture.clipboard === "failed"
              ? "Could not copy to the clipboard (see capture.log). "
              : "";
        const entry = createEntry(createFromCapture(capture.png), capture.capturedAt, { note });
        setEntries((all) => [...all, entry]);
        setStatus(`${note}Saving…`);
        // Saved the moment it is taken (spec story 86), in the final format (ADR 0004).
        entry.persister.start().catch((e) => setStatus(`${note}Could not save to the Library: ${String(e)}`));
      });
      if (cancelled) off();
      else unsubscribe = off;
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [bridge, createEntry]);

  // Save pending edits when the window is hidden or closed, so nothing waits on the 1 s timer.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    const flushAll = () => entriesRef.current.forEach((e) => void e.persister.flush());
    const onHide = () => document.visibilityState === "hidden" && flushAll();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushAll);
    };
  }, []);

  // A different image starts at the Select tool with nothing selected.
  useEffect(() => {
    setTool(SELECT_TOOL.id);
    setSelectedId(null);
  }, [current?.id]);

  const captureBytes = image?.capture ?? null;
  const imageUrl = useMemo(
    () => (captureBytes ? URL.createObjectURL(new Blob([captureBytes as BlobPart], { type: "image/png" })) : null),
    [captureBytes],
  );
  useEffect(() => () => (imageUrl ? URL.revokeObjectURL(imageUrl) : undefined), [imageUrl]);
  const size = useMemo(() => (captureBytes ? readSize(captureBytes) : null), [captureBytes]);

  const view = useWellView(size, current?.id ?? null);
  const readOnly = current?.readOnly ?? false;

  // --- model <-> canvas -------------------------------------------------------------------------

  const selected: Annotation | null = image?.model.annotations.find((a) => a.id === selectedId) ?? null;
  /** What the Style panel edits: the selected Annotation, else the active drawing tool. */
  const styledKind = selected ? kindOf(selected.type) : tool === SELECT_TOOL.id ? undefined : kindOf(tool);
  const styleOf = (type: string, annotation: Annotation | null): Style => {
    const kind = kindOf(type);
    const base = { ...kind?.defaultStyle, ...toolStyles[type] };
    if (!annotation) return base;
    const own: Style = {};
    for (const group of kind?.groups ?? []) (own as Record<string, unknown>)[group] = annotation[group as keyof Annotation];
    return { ...base, ...own };
  };
  const panelStyle = styledKind ? styleOf(styledKind.type, selected) : {};

  const events: CanvasEvents = {
    onCreate: (annotation) => {
      if (!current) return;
      current.session.apply({ kind: "add", annotation });
      // Like the layout prototype Andrew chose: after drawing, the new Annotation is selected and the tool is Select again.
      setTool(SELECT_TOOL.id);
      setSelectedId(annotation.id);
    },
    onUpdate: (id, patch) => current?.session.apply({ kind: "update", id, patch }),
    onSelect: setSelectedId,
  };

  useEffect(() => canvas?.sync(image?.model ?? emptyModel()), [canvas, image?.model]);
  useEffect(() => canvas?.setTool(tool), [canvas, tool]);
  useEffect(() => canvas?.select(selectedId), [canvas, selectedId, image?.model]);
  useEffect(
    () => canvas?.setDrawStyle(tool === SELECT_TOOL.id ? {} : styleOf(tool, null)),
    [canvas, tool, toolStyles],
  );

  const restyle = <K extends GroupId>(group: K, value: PropertyGroups[K]) => {
    const type = styledKind?.type;
    if (!type) return;
    setToolStyles((all) => ({ ...all, [type]: { ...all[type], [group]: value } }));
    if (selected && !readOnly) {
      current?.session.apply({ kind: "update", id: selected.id, patch: { [group]: value } as Partial<Annotation> });
    }
  };

  const chooseTool = (next: string) => {
    if (readOnly) return;
    setTool(next);
    setSelectedId(null);
  };

  // --- actions ----------------------------------------------------------------------------------

  const copy = async () => {
    if (!current) return;
    try {
      await bridge.copyImage(await exportPng(current.session.image, kit.render));
      setStatus("Copied");
    } catch (e) {
      setStatus(`Could not copy: ${String(e)}`);
    }
  };

  const saveAs = async () => {
    if (!current) return;
    try {
      // A plain Export (ADR 0004): never the Library file, which carries the Capture.
      const png = await exportPng(current.session.image, kit.render);
      const path = await bridge.savePngAs(png, `${formatStamp(current.capturedAt)}.png`);
      if (path !== null) setStatus(`Saved a copy to ${path}`);
    } catch (e) {
      setStatus(`Could not save: ${String(e)}`);
    }
  };

  const discarding = useRef(false);
  const discard = async () => {
    if (!current || discarding.current) return;
    discarding.current = true;
    try {
      // Waits for a save that is still in flight, then moves that very file to the Recycle Bin.
      await current.persister.discard();
      setEntries((all) => all.filter((e) => e.id !== current.id));
      setStatus("Discarded (moved to the Recycle Bin)");
    } catch (e) {
      setStatus(`Could not discard: ${String(e)}`);
    } finally {
      discarding.current = false;
    }
  };

  // --- keyboard: every key goes through the one shortcut table ------------------------------------

  const latest = useRef({ chooseTool, copy, discard, view, selectedId, hasImage: image !== null });
  latest.current = { chooseTool, copy, discard, view, selectedId, hasImage: image !== null };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = actionForKeyEvent(event, BINDINGS);
      if (!action) return;
      // Typing in a text field or in the Text tool's box: bare keys are the text's, not shortcuts.
      if (isTypingTarget(event.target as HTMLElement | null) && !allowedWhileTyping(action, event)) return;
      const now = latest.current;
      if (action.startsWith("tool.")) {
        // A tool whose ticket has not landed has a row in the table but no button: its key does nothing.
        const id = action.slice("tool.".length);
        if (TOOLS.some((t) => t.id === id)) now.chooseTool(id);
        return;
      }
      switch (action) {
        case "editor.deselect":
          now.chooseTool(SELECT_TOOL.id);
          break;
        case "editor.copy":
          // Ctrl+C copies the image only when nothing is selected (there is nothing else to copy yet).
          if (now.selectedId !== null || !now.hasImage) return;
          void now.copy();
          break;
        case "editor.discard":
          void now.discard();
          break;
        case "view.fit":
          now.view.fit();
          break;
        case "view.actualSize":
          now.view.actualSize();
          break;
        case "view.zoomIn":
          now.view.zoomIn();
          break;
        case "view.zoomOut":
          now.view.zoomOut();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="editor">
      <header className="topbar">
        <strong>Screenshot Annotation</strong>
        <button onClick={() => void bridge.startCapture()}>Capture</button>
        <span className="spacer" />
        <button onClick={() => void discard()} disabled={!image}>
          Discard
        </button>
        <button onClick={() => void saveAs()} disabled={!image}>
          Save as PNG…
        </button>
        <button className="primary" onClick={() => void copy()} disabled={!image}>
          Copy
        </button>
        <button className="icon" aria-label="Settings" title="Settings" onClick={() => void bridge.openSettings()}>
          ⚙
        </button>
      </header>
      <ToolColumn tools={TOOLS} active={tool} disabled={!image || readOnly} bindings={BINDINGS} onPick={chooseTool} />
      <main className="well" ref={view.wellRef}>
        {image && imageUrl && size ? (
          <Stage
            key={current!.id}
            kit={kit}
            imageUrl={imageUrl}
            size={size}
            scale={view.scale}
            interactive={!readOnly}
            events={events}
            onCanvas={setCanvas}
          />
        ) : hotkey ? (
          <p className="empty">Press {formatCombo(hotkey)} to capture</p>
        ) : null}
      </main>
      <StylePanel kind={readOnly ? null : (styledKind ?? null)} style={panelStyle} onChange={restyle} />
      <footer className="statusbar">
        <span role="status">{status}</span>
        {image && (
          <span className="zoom" role="group" aria-label="Zoom">
            <button onClick={view.zoomOut} aria-label="Zoom out">
              −
            </button>
            <span className="zoom-level" aria-label="Zoom level">{Math.round(view.scale * 100)}%</span>
            <button onClick={view.zoomIn} aria-label="Zoom in">
              +
            </button>
            <button onClick={view.fit} aria-pressed={view.mode.kind === "fit"}>
              Fit
            </button>
            <button onClick={view.actualSize}>100%</button>
          </span>
        )}
      </footer>
    </div>
  );
}
