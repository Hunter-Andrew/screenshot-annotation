import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fabricKit } from "../canvas/kit";
import type { AnnotationCanvas, CanvasEvents, CanvasKit, TextSelection } from "../canvas/types";
import {
  type AnnotatedImage,
  type FinishedRenderer,
  createFromCapture,
  decodeLibraryPng,
  exportPng,
  imageIdFor,
  stripEmbedded,
} from "../core/annotatedImage";
import { type Annotation, type Background, type Crop, emptyModel, newAnnotationId } from "../core/annotation";
import { eraseEdit } from "../core/annotations/erase";
import { changedRunKeys, resetRunKeys } from "../core/annotations/runs";
import { AREA_LIMIT_MESSAGE, followAreaEdit, setAreaEdit } from "../core/area";
import type { Edit } from "../core/editSession";
import { DEFAULT_IMAGE_SETTINGS, type ImageSettings } from "../shared/imageSettings";
import { kindOf } from "../core/annotations";
import { DEFAULT_IMAGE_STYLE } from "../core/annotations/image";
import { checkPastedImage, placeImage } from "../core/pasteImage";
import { createEditSession, type EditSession } from "../core/editSession";
import type { HistoryState } from "../core/history";
import { readSize } from "../core/png";
import type { Font, GroupId, PropertyGroups, Style } from "../core/propertyGroups";
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
import { imageOnClipboard, pictureAsPng } from "./clipboardImage";
import { actionForKeyEvent, allowedWhileTyping, defaultBindings, isTypingTarget, keyLabel } from "./shortcuts";
import { Stage } from "./Stage";
import { StylePanel } from "./StylePanel";
import { CROP_TOOL, SELECT_TOOL, TOOLS } from "./tools";
import { returnsToSelect } from "./toolBehavior";
import { ToolColumn } from "./ToolColumn";
import { DelayCapture } from "./DelayCapture";
import { useEasedNumber } from "./useEasedNumber";
import { useStickyStyles } from "./stickyStyles";
import { useWellView } from "./useWellView";
import { visibleCaptureArea } from "./view";

/** An image opened in this session: its edit session (the model), and the persister that keeps its Library file current. */
interface Entry {
  id: number;
  session: EditSession;
  persister: Persister;
  capturedAt: Date;
  /** Saved by a newer version of the app: shown, never edited or written. */
  readOnly: boolean;
}

/** The status line when a read-only image (saved by a newer version) is opened, and when a paste is refused on it. */
const READ_ONLY_NOTICE = "Opened read-only: it was saved by a newer version of Screenshot Annotation";
const NOTHING_OPEN_NOTICE = "Take or open a capture before pasting an image";

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
  // The Settings choices for new images (default background) and for how transparency looks (checkerboard).
  const [imageSettings, setImageSettings] = useState<ImageSettings>(DEFAULT_IMAGE_SETTINGS);
  const imageSettingsRef = useRef(imageSettings);
  imageSettingsRef.current = imageSettings;
  /** The Export renderer with the Dark background's colour from the Settings as of the moment it draws (never stored with the image). */
  const renderForExport = useCallback<FinishedRenderer>(
    (finished) => kit.render(finished, { darkBackground: imageSettingsRef.current.darkBackground }),
    [kit],
  );
  // The status line says the 8192 px limit stopped a growth until the next edit (a save would otherwise replace it).
  const limitNotice = useRef<string | null>(null);

  const [tool, setTool] = useState(SELECT_TOOL.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Last-used style per tool: loaded from the settings at start, stored again (after a short pause) when changed.
  const [toolStyles, setToolStyles] = useState<Record<string, Style>>({});
  const [canvas, setCanvas] = useState<AnnotationCanvas | null>(null);
  /** What the characters selected in the Text or Callout being typed in look like (null: none selected, or not typing). */
  const [textSelection, setTextSelection] = useState<TextSelection | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    void bridge.onImageSettings((next) => !cancelled && setImageSettings(next)).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else off = unsubscribe;
    });
    bridge.getImageSettings().then(
      (next) => !cancelled && setImageSettings(next),
      () => {},
    );
    return () => {
      cancelled = true;
      off?.();
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
        render: renderForExport,
        path: options.path,
        readOnly: options.readOnly,
        // The history is stored against the exact PNG just written, so a PNG changed elsewhere voids it.
        onSaved: ({ path, png, history, images, embedded }) => historyStore.save(path, png, history, { images, embedded }),
        onEvent: (event) => {
          // The Library Strip shows the new file, or the edited image's new thumbnail, right away.
          if (event.kind === "saved") void refreshLibrary();
          setStatus(
            event.kind === "saved"
              ? event.first
                ? `${note}Saved to ${event.path}`
                : (limitNotice.current ?? "All changes saved")
              : `Could not save to the Library: ${event.message}`,
          );
        },
      });
      session.subscribe(() => persister.markDirty());
      return { id, session, persister, capturedAt, readOnly: options.readOnly === true };
    },
    [bridge, renderForExport, historyStore, refreshLibrary],
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
        const fromFile = decodeLibraryPng(file.png);
        const restored = fromFile.readOnly ? undefined : await historyStore.openWithImages(file.path, file.png);
        if (token !== openToken.current) return;
        // The pixels of pasted images that were deleted come back with the history, for Undo.
        const decoded = restored ? { ...fromFile, images: { ...restored.images, ...fromFile.images } } : fromFile;
        const history = restored?.history;
        const entry = createEntry(decoded, capturedAtFromPath(file.path) ?? new Date(), {
          path: file.path,
          readOnly: decoded.readOnly,
          history,
        });
        setCurrent(entry);
        setScreen("editor");
        setStatus(decoded.readOnly ? READ_ONLY_NOTICE : null);
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
        const entry = createEntry(createFromCapture(capture.png, { showOutside: imageSettingsRef.current.showOutsideDefault }), capture.capturedAt, { note });
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
  // The visible area: the whole Capture, a Crop of it, or (ticket 37) an area reaching past its edges.
  const crop = image?.model.crop ?? null;
  const area = useMemo<Crop | null>(
    () => (crop ? crop : size ? { x: 0, y: 0, ...size } : null),
    [crop?.x, crop?.y, crop?.width, crop?.height, size], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // While the Crop tool is active the view keeps the Crop margin around the canvas (room to drag the handles out), and
  // a view in Fit re-fits to it, gliding, when the tool is entered or left (a zoom the user chose stays as chosen).
  const cropping = tool === CROP_TOOL.id;
  const wellMargin = useEasedNumber(cropping ? imageSettings.cropMargin : imageSettings.canvasMargin, cropping);
  const view = useWellView(area, current?.id ?? null, area ?? undefined, wellMargin);
  /** What fills the area outside the Capture: the image's own choice, else the Settings default. */
  const background: Background = image?.model.background ?? imageSettings.background;
  /** Whether the editor shows what lies outside the visible area: the image's own choice; a file without one shows it. */
  const showOutside = image?.model.showOutside ?? true;
  const readOnly = current?.readOnly ?? false;

  // --- model <-> canvas -------------------------------------------------------------------------

  const selected: Annotation | null = image?.model.annotations.find((a) => a.id === selectedId) ?? null;
  /** What the Style panel edits: the selected Annotation, else the active drawing tool. */
  const styledKind = selected ? kindOf(selected.type) : tool === SELECT_TOOL.id ? undefined : kindOf(tool);
  const styleOf = (type: string, annotation: Annotation | null): Style => {
    const kind = kindOf(type);
    const base = { ...kind?.defaultStyle, ...toolStyles[type] };
    // A tool style stored before vertical alignment existed still starts NEW boxes in the default alignment
    // (an older saved text keeps Top: its own font is read below, as stored).
    const defaultValign = kind?.defaultStyle.font?.valign;
    if (base.font && defaultValign && base.font.valign === undefined) base.font = { ...base.font, valign: defaultValign };
    if (!annotation) return base;
    const own: Style = {};
    for (const group of kind?.groups ?? []) (own as Record<string, unknown>)[group] = annotation[group as keyof Annotation];
    return { ...base, ...own };
  };
  const panelStyle = styledKind ? styleOf(styledKind.type, selected) : {};

  const report = (message: string) => {
    limitNotice.current = message;
    setStatus(message);
  };
  /**
   * An Annotation added, changed or deleted, with the visible area following it (what it covers is `bounds`: it
   * grows to include it, and shrinks back when the Annotation that grew it shrinks, moves inside or goes) as one
   * undo step. The growth stops at the 8192 px limit, with a message.
   */
  const commit = (edit: Edit, bounds?: Crop) => {
    if (!current) return;
    limitNotice.current = null;
    const grown = followAreaEdit(current.session.image, edit, bounds, imageSettings.background);
    current.session.apply(grown.edit);
    if (grown.limited) report(AREA_LIMIT_MESSAGE);
  };

  const events: CanvasEvents = {
    onCreate: (annotation, bounds) => {
      if (!current) return;
      commit({ kind: "add", annotation }, bounds);
      // Like the layout prototype Andrew chose: after drawing, the new Annotation is selected and the tool is Select
      // again, unless this tool is set to keep drawing (the Pen by default): then it stays active, nothing selected.
      if (!returnsToSelect(tool, behavior)) return;
      setTool(SELECT_TOOL.id);
      setSelectedId(annotation.id);
    },
    onErase: (path, radius) => {
      if (!current || readOnly) return;
      limitNotice.current = null;
      // Every Pen stroke the drag cut, with the area following them, is ONE undo step (a batch).
      const { edit, limited } = eraseEdit(current.session.image, path, radius, imageSettings.background, newAnnotationId);
      if (edit) current.session.apply(edit);
      if (limited) report(AREA_LIMIT_MESSAGE);
    },
    onUpdate: (id, patch, bounds) => commit({ kind: "update", id, patch }, bounds),
    onCrop: (next, how) => {
      if (!current) return;
      limitNotice.current = null;
      const { edit, limited } = setAreaEdit(current.session.image, next, imageSettings.background);
      if (edit) current.session.apply(edit);
      if (limited) report(AREA_LIMIT_MESSAGE);
      // Dragging a handle leaves the Crop tool on, to fine-tune the other edges; a fresh rectangle follows the tool's option.
      if (how !== "handle" && returnsToSelect(CROP_TOOL.id, behavior)) setTool(SELECT_TOOL.id);
    },
    // A drag went further than the image may grow: it stopped at the limit (the edit it made was applied first).
    onLimit: () => report(AREA_LIMIT_MESSAGE),
    onTextSelection: setTextSelection,
    onSelect: (id) => {
      setSelectedId(id);
      if (id !== null) setSelection(NO_SELECTION); // working on an Annotation: Delete means it, not the picked thumbnails
    },
  };

  useEffect(() => canvas?.sync(image?.model ?? emptyModel(), image?.images), [canvas, image?.model, image?.images]);
  useEffect(() => canvas?.setTool(tool), [canvas, tool]);
  useEffect(() => canvas?.select(selectedId), [canvas, selectedId, image?.model]);
  useEffect(
    () => canvas?.setDrawStyle(tool === SELECT_TOOL.id ? {} : styleOf(tool, null)),
    [canvas, tool, toolStyles],
  );

  const restyle = <K extends GroupId>(group: K, value: PropertyGroups[K]) => {
    const type = styledKind?.type;
    if (!type) return;
    // A pasted image has no sticky style: every paste starts plain (ticket 38).
    if (!styledKind.pasted) {
      setToolStyles((all) => ({ ...all, [type]: { ...all[type], [group]: value } }));
      stickyStyles.remember(type, { ...toolStyles[type], [group]: value });
    }
    // A tool-only group (the Pen's Mode) is never part of a stroke.
    if (selected && !readOnly && !styledKind.toolGroups?.includes(group)) {
      const patch: Record<string, unknown> = { [group]: value };
      // A change of the whole box's size, Bold, Italic, Underline or color means all of the text, so no character keeps
      // its own value of what changed. It is one edit, so one undo step restores both.
      if (group === "font" && (selected.type === "text" || selected.type === "callout") && selected.runs?.length) {
        const kept = resetRunKeys(selected.runs, changedRunKeys(selected.font, value as Font));
        if (JSON.stringify(kept) !== JSON.stringify(selected.runs)) patch.runs = kept;
      }
      current?.session.apply({ kind: "update", id: selected.id, patch: patch as Partial<Annotation> });
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
    commit({ kind: "delete", id: selectedId! });
    setSelectedId(null);
  };
  const moveSelected = (by: 1 | -1) => {
    if (!current || readOnly || selectedIndex < 0) return;
    current.session.apply({ kind: "reorder", id: selectedId!, to: selectedIndex + by });
  };

  /** Widen back to the whole Capture. A step of its own, so Undo brings the crop back. */
  const removeCrop = () => {
    if (!current || readOnly || !size) return;
    // Setting the area explicitly (here: the whole Capture), so what grew it is forgotten in the same step.
    const { edit } = setAreaEdit(current.session.image, { x: 0, y: 0, ...size }, imageSettings.background);
    if (edit) current.session.apply(edit);
  };

  /** The Image section's "Show outside the canvas": one undo step, kept with the image. */
  const chooseShowOutside = (next: boolean) => {
    if (!current || readOnly) return;
    current.session.apply({ kind: "setShowOutside", showOutside: next });
  };

  /** The Image section's Background: one undo step, kept with the image. */
  const chooseBackground = (next: Background) => {
    if (!current || readOnly) return;
    current.session.apply({ kind: "setBackground", background: next });
  };

  const copy = async () => {
    if (!current) return;
    try {
      await bridge.copyImage(await exportPng(current.session.image, renderForExport));
      setStatus("Copied");
    } catch (e) {
      setStatus(`Could not copy: ${String(e)}`);
    }
  };

  const saveAs = async () => {
    if (!current) return;
    try {
      // A plain Export (ADR 0004): never the Library file, which carries the Capture.
      const png = await exportPng(current.session.image, renderForExport);
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
      await bridge.copyImage(stripEmbedded(file.png));
      setStatus("Copied");
    } catch (e) {
      setStatus(`Could not copy: ${String(e)}`);
    }
  };
  const deleteSelection = () => void del.deletePaths([...selection.selected]);

  // --- keyboard: every key goes through the one shortcut table ------------------------------------

  // --- paste: Ctrl+V with a picture on the clipboard (ticket 38) ------------------------------------

  /** Make `file` an image Annotation on the open image: refused, with a plain message, when it does not fit the limits. */
  const pasteImage = async (file: Blob) => {
    const entry = currentRef.current;
    if (!entry) return setStatus(NOTHING_OPEN_NOTICE);
    if (entry.readOnly) return setStatus(READ_ONLY_NOTICE);
    try {
      const bytes = await pictureAsPng(file);
      const existing = entry.session.image.model.annotations.filter((a) => a.type === "image").length;
      const checked = checkPastedImage(bytes, existing);
      if (!checked.ok) return setStatus(checked.message);
      const imageId = await imageIdFor(bytes);
      if (currentRef.current !== entry) return; // another image was shown while this was read
      const captureSize = readSize(entry.session.image.capture);
      // The part of the Capture on screen; with nothing laid out (or none visible) the whole Capture counts.
      const well = view.wellRef.current;
      const stage = well?.querySelector(".stage");
      const visible =
        well && stage ? visibleCaptureArea(well.getBoundingClientRect(), stage.getBoundingClientRect(), view.scale) : null;
      const box = placeImage(checked, captureSize, visible ?? { x: 0, y: 0, ...captureSize });
      entry.session.registerImage(imageId, bytes);
      const annotation: Annotation = { id: newAnnotationId(), type: "image", ...box, imageId, ...DEFAULT_IMAGE_STYLE };
      entry.session.apply({ kind: "add", annotation });
      // Selected, and a drawing tool that was active goes back to Select.
      setTool(SELECT_TOOL.id);
      setSelectedId(annotation.id);
    } catch (e) {
      setStatus("The clipboard picture could not be read as an image");
    }
  };
  const pasteRef = useRef(pasteImage);
  pasteRef.current = pasteImage;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      // The full-window grid is not an editor; typing in a field or in a text box is a text paste.
      if (screenRef.current === "grid") return;
      if (isTypingTarget(event.target as HTMLElement | null) || isTypingTarget(document.activeElement as HTMLElement | null)) return;
      const file = imageOnClipboard(event.clipboardData);
      if (!file) return; // text (or nothing): not ours; the image wins only when there is one
      event.preventDefault();
      void pasteRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

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
    <div className="editor" data-checker={imageSettings.checkerboard}>
      {/* The grid covers the editor; the editor stays mounted (its canvas and view survive) but out of reach. */}
      <div className="editor-body" inert={screen === "grid"}>
        <header className="topbar">
          <strong>Screenshot Annotation</strong>
          <button onClick={() => void bridge.startCapture()}>Capture</button>
          <DelayCapture bridge={bridge} />
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
        <main className="well" ref={view.wellRef} style={{ "--outside-darkness": Number((imageSettings.outsideDarkness / 100).toFixed(4)) } as CSSProperties}>
          {image && imageUrl && size && area ? (
            <Stage
              key={current!.id}
              kit={kit}
              imageUrl={imageUrl}
              size={size}
              area={area}
              background={background}
              darkBackground={imageSettings.darkBackground}
              darkness={imageSettings.outsideDarkness}
              showOutside={showOutside}
              margin={view.margin}
              scale={view.scale}
              interactive={!readOnly}
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
          textEditing={
            canvas && styledKind?.typedInPlace
              ? { selection: textSelection, onStyle: (patch) => canvas.styleTextSelection(patch), focusText: () => canvas.focusText() }
              : null
          }
          toolGroups={!selected && tool !== SELECT_TOOL.id ? styledKind?.toolGroups : undefined}
          image={
            // With the Select tool and nothing selected, and while the Crop tool is on: the image's own settings.
            image && !readOnly && ((tool === SELECT_TOOL.id && selectedId === null) || tool === CROP_TOOL.id)
              ? { background, onChange: chooseBackground, showOutside, onShowOutside: chooseShowOutside }
              : null
          }
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
          collapsed={imageSettings.libraryStripCollapsed}
          onToggleCollapsed={() => {
            const collapsed = !imageSettings.libraryStripCollapsed;
            setImageSettings((now) => ({ ...now, libraryStripCollapsed: collapsed }));
            bridge.setLibraryStripCollapsed(collapsed).catch(() => {});
          }}
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
