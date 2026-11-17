import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fabricKit } from "../canvas/kit";
import type { AnnotationCanvas, CanvasEvents, CanvasKit } from "../canvas/types";
import {
  type AnnotatedImage,
  createFromCapture,
  decodeLibraryPng,
  EMBED_CHUNK,
  exportPng,
} from "../core/annotatedImage";
import { type Annotation, emptyModel } from "../core/annotation";
import { kindOf } from "../core/annotations";
import { createEditSession, type EditSession } from "../core/editSession";
import type { HistoryState } from "../core/history";
import { readSize, removeChunks } from "../core/png";
import type { GroupId, PropertyGroups, Style } from "../core/propertyGroups";
import type { PlatformBridge } from "../platform/bridge";
import { LibraryGrid } from "../library/LibraryGrid";
import { fileName, type LibraryImage, neighbourAfterRemoval, toLibraryImages } from "../library/libraryModel";
import { LibraryStrip } from "../library/LibraryStrip";
import { clickThumbnail, NO_SELECTION, pruneSelection } from "../library/selection";
import { createThumbnailLoader } from "../library/thumbnails";
import { UndoNotice } from "../library/UndoNotice";
import { useDeleteWithUndo } from "../library/useDeleteWithUndo";
import { useLibrary } from "../library/useLibrary";
import { capturedAtFromPath, formatStamp } from "../shared/stamp";
import { formatCombo } from "../settings/hotkey";
import "./editor.css";
import { createPersister, type Persister } from "./persister";
import { createHistoryStore } from "./historyStore";
import { actionForKeyEvent, allowedWhileTyping, defaultBindings, isTypingTarget, keyLabel } from "./shortcuts";
import { Stage } from "./Stage";
import { StylePanel } from "./StylePanel";
import { CROP_TOOL, SELECT_TOOL, TOOLS } from "./tools";
import { returnsToSelect } from "./toolBehavior";
import { ToolColumn } from "./ToolColumn";
import { useStickyStyles } from "./stickyStyles";
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
  // The image open in the editor. Switching to another saves this one and lets it go; its undo history
  // is stored against its Library file, so opening it again brings the history back.
  const [current, setCurrent] = useState<Entry | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  // The Library folder as a live list (the Library Strip and grid), and the thumbnails drawn from it.
  const library = useLibrary(bridge);
  const thumbnails = useMemo(() => createThumbnailLoader(bridge), [bridge]);
  const [screen, setScreen] = useState<"editor" | "grid">("editor");
  const screenRef = useRef(screen);
  screenRef.current = screen;
  // Thumbnails picked with Ctrl/Shift+click, for deleting several at once.
  const [selection, setSelection] = useState(NO_SELECTION);
  const openToken = useRef(0);
  const image = useSessionImage(current?.session ?? null);
  const nextId = useRef(0);
  const [status, setStatus] = useState<string | null>(null);
  // The real capture hotkey, for the empty-state hint; null until the platform has answered.
  const [hotkey, setHotkey] = useState<string | null>(null);

  const [tool, setTool] = useState(SELECT_TOOL.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Last-used style per tool: loaded from the settings at start, stored again (after a short pause) when changed.
  const [toolStyles, setToolStyles] = useState<Record<string, Style>>({});
  const [canvas, setCanvas] = useState<AnnotationCanvas | null>(null);
  // The user's own "return to Select after drawing" choice per tool (sticky too); a tool not in here uses its default.
  const [behavior, setBehavior] = useState<Record<string, boolean>>({});
  const stickyStyles = useStickyStyles(bridge, setToolStyles, setBehavior);
  // Undo history of each Library image, kept in local app data between runs (ticket 13).
  const historyStore = useMemo(() => createHistoryStore({ bridge }), [bridge]);

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

  const refreshLibrary = library.refresh;

  /** A new Entry for `decoded`, with its auto-save wired to the status line. */
  const createEntry = useCallback(
    (
      decoded: AnnotatedImage,
      capturedAt: Date,
      options: { path?: string; readOnly?: boolean; note?: string; history?: HistoryState } = {},
    ): Entry => {
      const id = nextId.current++;
      const session = createEditSession(decoded, { history: options.history });
      const note = options.note ?? "";
      const persister = createPersister({
        bridge,
        session,
        capturedAt,
        render: kit.render,
        path: options.path,
        readOnly: options.readOnly,
        // The history is stored against the exact PNG just written, so a PNG changed elsewhere voids it.
        onSaved: ({ path, png, history }) => historyStore.save(path, png, history),
        onEvent: (event) => {
          // The Library Strip shows the new file, or the edited image's new thumbnail, right away.
          if (event.kind === "saved") void refreshLibrary();
          setStatus(
            event.kind === "saved"
              ? event.first
                ? `${note}Saved to ${event.path}`
                : "All changes saved"
              : `Could not save to the Library: ${event.message}`,
          );
        },
      });
      session.subscribe(() => persister.markDirty());
      return { id, session, persister, capturedAt, readOnly: options.readOnly === true };
    },
    [bridge, kit, historyStore, refreshLibrary],
  );

  /**
   * Show a Library image (a click in the strip or grid, or on start): save the open one first, then read
   * the file, with its undo history, into a new edit session. Never rejects; a failure is reported.
   */
  const openImage = useCallback(
    async (path: string) => {
      const token = ++openToken.current;
      const previous = currentRef.current;
      if (previous && previous.persister.path === path) {
        setScreen("editor");
        return;
      }
      await previous?.persister.flush();
      if (token !== openToken.current) return; // a newer open (or a new Capture) won
      try {
        const file = await bridge.readLibraryFile(path);
        const decoded = decodeLibraryPng(file.png);
        const history = decoded.readOnly ? undefined : await historyStore.open(file.path, file.png);
        if (token !== openToken.current) return;
        const entry = createEntry(decoded, capturedAtFromPath(file.path) ?? new Date(), {
          path: file.path,
          readOnly: decoded.readOnly,
          history,
        });
        setCurrent(entry);
        setScreen("editor");
        setStatus(decoded.readOnly ? "Opened read-only: it was saved by a newer version of Screenshot Annotation" : null);
        // An edit made while the file was being read is saved too (the file is only ever read again after this).
        void previous?.persister.flush();
      } catch (e) {
        if (token === openToken.current) setStatus(`Could not open ${fileName(path)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [bridge, createEntry, historyStore],
  );

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      // Drop the undo history of images not opened for 60 days (before opening, which counts as use).
      await historyStore.purgeExpired();
      // First reopen the newest image (by capture time), so edits survive a restart. Before subscribing to
      // Captures: a Capture that is saved later can then never be mistaken for it.
      try {
        const [newest] = toLibraryImages(await bridge.listLibrary());
        if (newest && !cancelled) await openImage(newest.path);
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
        openToken.current++; // an open that is still reading loses to the new Capture
        void currentRef.current?.persister.flush();
        setCurrent(entry);
        setScreen("editor");
        setSelection(NO_SELECTION);
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
  }, [bridge, createEntry, historyStore, openImage]);

  // Save pending edits when the window is hidden or closed, so nothing waits on the 1 s timer.
  useEffect(() => {
    const flushAll = () => void currentRef.current?.persister.flush();
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

  // Undo can remove the selected Annotation (undoing its creation): nothing is selected then.
  useEffect(() => {
    if (selectedId !== null && image && !image.model.annotations.some((a) => a.id === selectedId)) setSelectedId(null);
  }, [image, selectedId]);

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
      // Like the layout prototype Andrew chose: after drawing, the new Annotation is selected and the tool is Select
      // again, unless this tool is set to keep drawing (the Pen by default): then it stays active, nothing selected.
      if (!returnsToSelect(tool, behavior)) return;
      setTool(SELECT_TOOL.id);
      setSelectedId(annotation.id);
    },
    onUpdate: (id, patch) => current?.session.apply({ kind: "update", id, patch }),
    onCrop: (crop) => {
      if (!current) return;
      current.session.apply({ kind: "setCrop", crop });
      if (returnsToSelect(CROP_TOOL.id, behavior)) setTool(SELECT_TOOL.id);
    },
    onSelect: (id) => {
      setSelectedId(id);
      if (id !== null) setSelection(NO_SELECTION); // working on an Annotation: Delete means it, not the picked thumbnails
    },
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
    stickyStyles.remember(type, { ...toolStyles[type], [group]: value });
    if (selected && !readOnly) {
      current?.session.apply({ kind: "update", id: selected.id, patch: { [group]: value } as Partial<Annotation> });
    }
  };

  const setReturnToSelect = (value: boolean) => {
    if (tool === SELECT_TOOL.id) return;
    setBehavior((all) => ({ ...all, [tool]: value }));
    stickyStyles.rememberBehavior(tool, value);
  };

  const chooseTool = (next: string) => {
    if (readOnly) return;
    setTool(next);
    setSelectedId(null);
  };

  // --- actions ----------------------------------------------------------------------------------

  // Undo, redo, delete and stacking order all go through the edit session (the one choke point),
  // so they are recorded and saved like any other change. Each does nothing for a read-only image.
  const undo = () => void (!readOnly && current?.session.undo());
  const redo = () => void (!readOnly && current?.session.redo());
  const selectedIndex = image?.model.annotations.findIndex((a) => a.id === selectedId) ?? -1;
  const stackSize = image?.model.annotations.length ?? 0;
  const deleteSelected = () => {
    if (!current || readOnly || selectedIndex < 0) return;
    current.session.apply({ kind: "delete", id: selectedId! });
    setSelectedId(null);
  };
  const moveSelected = (by: 1 | -1) => {
    if (!current || readOnly || selectedIndex < 0) return;
    current.session.apply({ kind: "reorder", id: selectedId!, to: selectedIndex + by });
  };

  /** Widen back to the whole Capture. A step of its own, so Undo brings the crop back. */
  const removeCrop = () => {
    if (!current || readOnly) return;
    current.session.apply({ kind: "setCrop", crop: null });
  };

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

  // --- Library: delete with Undo, copy, selection ----------------------------------------------------

  const del = useDeleteWithUndo({
    bridge,
    removeHistory: historyStore.remove,
    getOpen: () => currentRef.current,
    getImages: library.getImages,
    refresh: library.refresh,
    afterOpenDeleted: async (next) => {
      setCurrent(null);
      setSelectedId(null);
      if (next) await openImage(next);
    },
    open: openImage,
    report: setStatus,
  });
  const discard = del.discardOpen;

  // The open image's file was deleted in Explorer (the folder is the source of truth): let it go, without
  // writing it back, and show the next image.
  const previousImages = useRef<LibraryImage[]>([]);
  useEffect(() => {
    const before = previousImages.current;
    previousImages.current = library.images;
    const open = currentRef.current;
    const path = open?.persister.path;
    if (!open || !path || !library.loaded || library.images.some((i) => i.path === path)) return;
    let cancelled = false;
    // The list can be a moment behind (a file written just now): only a file that cannot be read is gone.
    bridge.readLibraryFile(path).then(
      () => {},
      () => {
        if (cancelled || currentRef.current !== open) return;
        open.persister.abandon();
        void historyStore.remove(path);
        setCurrent(null);
        setSelectedId(null);
        setStatus(`${fileName(path)} was deleted outside the app`);
        const next = neighbourAfterRemoval(before.some((i) => i.path === path) ? before : library.images, new Set([path]), path);
        if (next) void openImage(next).then(() => setStatus(`${fileName(path)} was deleted outside the app`));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [library.images, library.loaded, bridge, historyStore, openImage]);

  const clearSelection = () => setSelection(NO_SELECTION);
  // Keep the selection to images that still exist (deleted here, or in Explorer).
  useEffect(() => {
    const existing = new Set(library.images.map((i) => i.path));
    setSelection((now) => pruneSelection(now, existing));
  }, [library.images]);

  const onThumbnailClick = (event: React.MouseEvent, image: LibraryImage) => {
    const result = clickThumbnail(
      selection,
      library.images.map((i) => i.path),
      image.path,
      { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey },
      current?.persister.path ?? null,
    );
    if (result.kind === "select") {
      setSelection(result.selection);
    } else {
      setSelection(NO_SELECTION);
      void openImage(image.path);
    }
  };

  /** Hover Copy: the file's finished picture as a plain Export (never the editable data, ADR 0004). */
  const copyLibraryImage = async (image: LibraryImage) => {
    try {
      // The open image may have an edit not saved yet.
      if (currentRef.current?.persister.path === image.path) await currentRef.current.persister.flush();
      const file = await bridge.readLibraryFile(image.path);
      await bridge.copyImage(removeChunks(file.png, EMBED_CHUNK));
      setStatus("Copied");
    } catch (e) {
      setStatus(`Could not copy: ${String(e)}`);
    }
  };
  const deleteSelection = () => void del.deletePaths([...selection.selected]);

  // --- keyboard: every key goes through the one shortcut table ------------------------------------

  const selectionSize = selection.selected.size;
  const keys = { chooseTool, copy, discard, view, selectedId, hasImage: image !== null, undo, redo, deleteSelected, moveSelected, selectionSize, deleteSelection, clearSelection };
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = actionForKeyEvent(event, BINDINGS);
      if (!action) return;
      // Typing in a text field or in the Text tool's box: bare keys are the text's, not shortcuts.
      if (isTypingTarget(event.target as HTMLElement | null) && !allowedWhileTyping(action, event)) return;
      const now = latest.current;
      if (screenRef.current === "grid") {
        // The grid replaces the whole window: only leaving it and deleting what is selected apply there.
        if (action === "editor.deselect") setScreen("editor");
        else if ((action === "editor.delete" || action === "editor.deleteBackspace") && now.selectionSize > 0) now.deleteSelection();
        else return;
        event.preventDefault();
        return;
      }
      if (action.startsWith("tool.")) {
        // A tool whose ticket has not landed has a row in the table but no button: its key does nothing.
        const id = action.slice("tool.".length);
        if (TOOLS.some((t) => t.id === id)) now.chooseTool(id);
        return;
      }
      switch (action) {
        case "editor.deselect":
          now.clearSelection();
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
        case "editor.undo":
          now.undo();
          break;
        case "editor.redo":
        case "editor.redoAlt":
          now.redo();
          break;
        case "editor.delete":
        case "editor.deleteBackspace":
          // Thumbnails picked in the strip are what Delete means; otherwise it removes the selected Annotation.
          if (now.selectionSize > 0) now.deleteSelection();
          else now.deleteSelected();
          break;
        case "editor.bringForward":
          now.moveSelected(1);
          break;
        case "editor.sendBack":
          now.moveSelected(-1);
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
      {/* The grid covers the editor; the editor stays mounted (its canvas and view survive) but out of reach. */}
      <div className="editor-body" inert={screen === "grid"}>
        <header className="topbar">
          <strong>Screenshot Annotation</strong>
          <button onClick={() => void bridge.startCapture()}>Capture</button>
          <button
            onClick={undo}
            disabled={!current || readOnly || !current.session.canUndo}
            title={`Undo (${keyLabel("editor.undo", BINDINGS)})`}
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!current || readOnly || !current.session.canRedo}
            title={`Redo (${keyLabel("editor.redo", BINDINGS)})`}
          >
            Redo
          </button>
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
              crop={image.model.crop}
              events={events}
              onCanvas={setCanvas}
            />
          ) : hotkey ? (
            <p className="empty">Press {formatCombo(hotkey)} to capture</p>
          ) : null}
        </main>
        <StylePanel
          kind={readOnly ? null : (styledKind ?? null)}
          style={panelStyle}
          onChange={restyle}
          crop={
            readOnly || (tool !== CROP_TOOL.id && !image?.model.crop)
              ? null
              : { active: tool === CROP_TOOL.id, hasCrop: !!image?.model.crop, onRemove: removeCrop }
          }
          toolOption={
            // About the ACTIVE TOOL (never the selected Annotation): only while a drawing tool is picked.
            readOnly || !styledKind
              ? null
              : {
                  label: "Return to Select after drawing",
                  checked: returnsToSelect(tool, behavior),
                  onChange: setReturnToSelect,
                  hidden: tool === SELECT_TOOL.id,
                }
          }
          arrange={
            readOnly || selectedIndex < 0
              ? null
              : {
                  canForward: selectedIndex < stackSize - 1,
                  canBack: selectedIndex > 0,
                  onForward: () => moveSelected(1),
                  onBack: () => moveSelected(-1),
                  onDelete: deleteSelected,
                  titles: {
                    forward: `Bring forward (${keyLabel("editor.bringForward", BINDINGS)})`,
                    back: `Send back (${keyLabel("editor.sendBack", BINDINGS)})`,
                    delete: `Delete (${keyLabel("editor.delete", BINDINGS)})`,
                  },
                }
          }
        />
        <LibraryStrip
          images={library.images}
          loaded={library.loaded}
          loader={thumbnails}
          currentPath={current?.persister.path ?? null}
          selected={selection.selected}
          onClick={onThumbnailClick}
          onCopy={(i) => void copyLibraryImage(i)}
          onDelete={(i) => void del.deletePaths([i.path])}
          onShowAll={() => setScreen("grid")}
        />
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
      {screen === "grid" && (
        <LibraryGrid
          images={library.images}
          loaded={library.loaded}
          loader={thumbnails}
          currentPath={current?.persister.path ?? null}
          selected={selection.selected}
          hotkey={hotkey}
          now={new Date()}
          status={status}
          onClick={onThumbnailClick}
          onCopy={(i) => void copyLibraryImage(i)}
          onDelete={(i) => void del.deletePaths([i.path])}
          onDeleteSelected={deleteSelection}
          onClearSelection={clearSelection}
          onBack={() => setScreen("editor")}
        />
      )}
      {del.notice && <UndoNotice count={del.notice.count} onUndo={() => void del.undo()} />}
    </div>
  );
}
