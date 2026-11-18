import { encodeRgbaPng, readSize } from "../core/png";
import { CALLOUT_TAIL_PERCENT, CANVAS_MARGIN, CROP_MARGIN, DEFAULT_IMAGE_SETTINGS, type ImageSettings, inRange, isDarkBackground, OUTSIDE_DARKNESS, sanitizeImageSettings } from "../shared/imageSettings";
import { formatStamp } from "../shared/stamp";
import type { CaptureResult, LibraryFile, LibraryItem, OverlayOutcome, OverlayRect, PlatformBridge } from "./bridge";

export interface SimulatedShot {
  width: number;
  height: number;
  rgba: ArrayLike<number>;
  capturedAt?: Date;
  /** What the platform's automatic clipboard copy did: "copied" puts the plain PNG on the fake clipboard. */
  clipboard?: "copied" | "failed";
}

export interface FakeBridge extends PlatformBridge {
  /** URLs passed to openUrl, in order. */
  readonly openedUrls: string[];
  /** PNGs written to the fake clipboard, in order. */
  readonly copiedImages: Uint8Array[];
  /** Library files written, in order (`path` is relative to the Library folder). */
  readonly libraryFiles: { path: string; bytes: Uint8Array }[];
  /** Files written by Save as PNG… in order. */
  readonly savedAs: { suggestedName: string; path: string; bytes: Uint8Array }[];
  /** Library paths moved to the Recycle Bin, in order (they leave `libraryFiles`). */
  readonly discardedPaths: string[];
  /** Every auto-save `updateLibraryFile` call that succeeded, in order. */
  readonly libraryUpdates: { path: string; bytes: Uint8Array }[];
  /** Library paths moved to the Recycle Bin by a delete from the strip or grid, in order (not Discard). */
  readonly trashedPaths: string[];
  /** Library paths put back by Undo, in order (where they landed). */
  readonly restoredPaths: string[];
  /** Paths `getThumbnail` was asked for, in order. */
  readonly thumbnailRequests: string[];
  /** How many times the Library was listed. */
  readonly libraryListings: number;
  /** Like Explorer: drop a PNG into the Library folder. `path` defaults to a name made from `capturedAt`. */
  addLibraryFile(png: Uint8Array, options?: { path?: string; capturedAt?: Date }): string;
  /** Like Explorer: delete a file from the Library folder (no Recycle Bin bookkeeping here). */
  removeLibraryFile(path: string): void;
  /** The next `trashLibraryFiles` rejects with this message. */
  failNextTrash(message: string): void;
  /** The next `restoreLibraryFiles` restores nothing. */
  failNextRestore(): void;
  /** The next `updateLibraryFile` rejects with this message. */
  failNextLibraryUpdate(message: string): void;
  /** Undo history files by key (`modifiedAt`: ms since the epoch; tests may set it to age a file). Survive a reload in the browser build. */
  readonly historyFiles: Map<string, { text: string; modifiedAt: number }>;
  /** Seconds passed to `startDelayedCapture`, in order. */
  readonly delayedCaptures: number[];
  /** Drive the countdown badge like the platform does: show `remaining`, or null once it is over. */
  setCountdown(remaining: number | null): void;
  /** Launch at sign-in as stored (`fake.launchAtSignIn` in the fake storage; on for a fresh fake). */
  readonly launchAtSignIn: boolean;
  /** The next `setLaunchAtSignIn` rejects with this message (Windows refused the registry write). */
  failNextLaunchAtSignIn(message: string): void;
  /** The folder `getLibraryFolder` reports. */
  readonly libraryFolder: string;
  /** How many times "Open in Explorer" was used. */
  readonly libraryFolderOpened: number;
  /** How many times the tool styles were reset. */
  readonly toolStylesResets: number;
  /** Start or end a capture on the overlay pages: an attempt number, or null for idle. */
  setOverlayAttempt(attempt: number | null): void;
  /** How many times the editor asked to open Settings (the gear button). */
  readonly settingsOpened: number;
  /** The next Save as PNG… behaves as if the user cancelled the dialog. */
  cancelNextSaveAs(): void;
  /** The next Discard rejects with this message. */
  failNextDiscard(message: string): void;
  /** Deliver a Capture as if the hotkey had been pressed. */
  simulateCapture(shot: SimulatedShot): void;
  /** Monitor indexes whose overlay asked for its frozen frame, in order. */
  readonly overlayFrameRequests: number[];
  /** Monitor indexes whose overlay asked for its window list, in order. */
  readonly overlayWindowRequests: number[];
  /** Monitor indexes whose overlay reported ready, in order. */
  readonly readyOverlays: number[];
  /** What the overlay finished with, in order. */
  readonly overlayOutcomes: OverlayOutcome[];
  /** Lines the overlay page wrote to the diagnostics log. */
  readonly overlayLogs: { message: string; fatal: boolean }[];
  /** Make the next `overlayFrame` call reject with this message. */
  failNextOverlayFrame(message: string): void;
  /** The registered capture hotkey (accelerator). */
  readonly hotkey: string;
  /** Combinations "another app" owns; `setHotkey` reports a conflict for these. Mutable by tests. */
  readonly takenHotkeys: Set<string>;
  /** How many times the Bluetooth & devices settings deep link was opened. */
  readonly keyboardSettingsOpened: number;
  /** Lines the Settings page wrote to the diagnostics log. */
  readonly settingsLogs: string[];
  /** Mimic the user flipping the Windows Print Screen toggle (true = still opens Snipping Tool). */
  setPrintScreenSnipping(enabled: boolean): void;
  /** Whether the one-time Print Screen notice was answered. */
  readonly printScreenNoticeDismissed: boolean;
  /** The stored magnifier setting (`fake.magnifier` in the fake storage; on for a fresh fake). */
  readonly magnifier: boolean;
  /** The stored image settings (`fake.imageSettings` in the fake storage; Transparent and Light for a fresh fake). */
  readonly imageSettings: ImageSettings;
  /** The stored tool styles (`fake.toolStyles` in the fake storage; empty for a fresh fake). */
  readonly toolStyles: Record<string, unknown>;
}

/** Fake setting storage; the browser build passes localStorage so e2e reloads keep it. */
export type FakeStorage = Pick<Storage, "getItem" | "setItem">;

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** What `startCapture` produces unless a test says otherwise: a small gradient. */
function defaultShot(): SimulatedShot {
  const width = 64;
  const height = 48;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rgba.set([x * 4, y * 5, 128, 255], (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

export function createFakeBridge(
  options: {
    version?: string;
    /** Windows' PrintScreenKeyForSnippingEnabled reads as on (the default) or explicitly 0. */
    printScreenSnippingEnabled?: boolean;
    /** The Raw Input listener for bare Print Screen cannot start (the backend then reports it as not registered). */
    rawInputFails?: boolean;
    storage?: FakeStorage;
    overlayFrames?: Record<number, { width: number; height: number }>;
    /** Windows per monitor (topmost first, native pixels local to the monitor); none by default. */
    overlayWindows?: Record<number, OverlayRect[]>;
    /**
     * Which capture the overlay pages are showing at the start: an attempt number (the default, 1: a
     * window opened for a capture) or null (a pre-warmed window sitting idle and hidden).
     */
    overlayAttempt?: number | null;
  } = {},
): FakeBridge {
  const memory = new Map<string, string>();
  const store: FakeStorage = options.storage ?? {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
  };
  let hotkey = store.getItem("fake.hotkey") ?? "ctrl+shift+s";
  const takenHotkeys = new Set<string>();
  let keyboardSettingsOpened = 0;
  let snippingEnabled = options.printScreenSnippingEnabled ?? true;
  const settingsLogs: string[] = [];
  const overlayFrameRequests: number[] = [];
  const overlayWindowRequests: number[] = [];
  const readyOverlays: number[] = [];
  const overlayOutcomes: OverlayOutcome[] = [];
  const overlayLogs: { message: string; fatal: boolean }[] = [];
  let overlayFrameFailure: string | null = null;
  let overlayAttempt: number | null = options.overlayAttempt === undefined ? 1 : options.overlayAttempt;
  const overlayAttemptHandlers = new Set<(attempt: number | null) => void>();
  const delayedCaptures: number[] = [];
  let countdown: number | null = null;
  const countdownHandlers = new Set<(remaining: number | null) => void>();
  let launchFailure: string | null = null;
  let libraryFolderOpened = 0;
  let toolStylesResets = 0;
  const toolStylesResetHandlers = new Set<() => void>();
  const magnifierHandlers = new Set<(enabled: boolean) => void>();
  const imageSettingsHandlers = new Set<(settings: ImageSettings) => void>();
  const readImageSettings = (): ImageSettings => {
    try {
      return sanitizeImageSettings(JSON.parse(store.getItem("fake.imageSettings") ?? "null"));
    } catch {
      return DEFAULT_IMAGE_SETTINGS;
    }
  };
  const writeImageSettings = (settings: ImageSettings) => {
    store.setItem("fake.imageSettings", JSON.stringify(settings));
    imageSettingsHandlers.forEach((handler) => handler(settings));
  };
  const openedUrls: string[] = [];
  const copiedImages: Uint8Array[] = [];
  const libraryFiles: { path: string; bytes: Uint8Array }[] = [];
  const libraryUpdates: { path: string; bytes: Uint8Array }[] = [];
  // When each Library file was last written (ms since the epoch, strictly increasing so a rewrite
  // always changes it); the thumbnail of a file is made again when this changes.
  const writtenAt = new Map<string, number>();
  let writeCounter = 0;
  const nextWriteTime = () => (writeCounter = Math.max(writeCounter + 1, Date.now()));
  const libraryChangeHandlers = new Set<() => void>();
  // Like the real watcher, tell listeners after any change to the folder (ours or "Explorer's").
  const libraryChanged = () => queueMicrotask(() => libraryChangeHandlers.forEach((handler) => handler()));
  const trashedPaths: string[] = [];
  const restoredPaths: string[] = [];
  const thumbnailRequests: string[] = [];
  let libraryListings = 0;
  let trashFailure: string | null = null;
  let restoreFails = false;
  // Copies kept for Undo of a delete, like the real platform's.
  const stash = new Map<string, Uint8Array>();
  let libraryUpdateFailure: string | null = null;
  let settingsOpened = 0;
  const savedAs: FakeBridge["savedAs"] = [];
  const discardedPaths: string[] = [];
  // With a persistent store (the browser build), Library files survive a page reload, like the real
  // Library survives a restart.
  const persistLibrary = () => {
    libraryChanged();
    try {
      store.setItem(
        "fake.library",
        JSON.stringify(libraryFiles.map((f) => ({ path: f.path, b64: toBase64(f.bytes), at: writtenAt.get(f.path) ?? 0 }))),
      );
    } catch {
      // Over the browser's storage quota (big test Captures): the Library then simply does not survive a reload.
    }
  };
  try {
    const saved = JSON.parse(store.getItem("fake.library") ?? "[]") as { path: string; b64: string; at: number }[];
    for (const f of saved) {
      libraryFiles.push({ path: f.path, bytes: fromBase64(f.b64) });
      writtenAt.set(f.path, f.at);
      writeCounter = Math.max(writeCounter, f.at);
    }
  } catch {
    // An unreadable store is an empty Library.
  }
  // Undo history files, kept like the Library so a reload in the browser build still finds them.
  const historyFiles: FakeBridge["historyFiles"] = new Map();
  try {
    const saved = JSON.parse(store.getItem("fake.history") ?? "[]") as [string, { text: string; modifiedAt: number }][];
    for (const [key, file] of saved) historyFiles.set(key, file);
  } catch {
    // An unreadable store is no history.
  }
  const persistHistory = () => {
    try {
      store.setItem("fake.history", JSON.stringify([...historyFiles]));
    } catch {
      // Over the browser's quota: history then does not survive a reload.
    }
  };
  let cancelSaveAs = false;
  let discardFailure: string | null = null;
  const handlers = new Set<(capture: CaptureResult) => void>();
  const undelivered: CaptureResult[] = [];

  const deliver = (capture: CaptureResult) => {
    if (handlers.size === 0) undelivered.push(capture);
    handlers.forEach((handler) => handler(capture));
  };
  const simulateCapture = (shot: SimulatedShot) => {
    const png = encodeRgbaPng(shot.width, shot.height, Uint8Array.from(shot.rgba));
    if (shot.clipboard === "copied") copiedImages.push(png);
    deliver({
      width: shot.width,
      height: shot.height,
      capturedAt: shot.capturedAt ?? new Date(),
      png,
      clipboard: shot.clipboard,
    });
  };

  return {
    openedUrls,
    copiedImages,
    libraryFiles,
    savedAs,
    discardedPaths,
    historyFiles,
    libraryUpdates,
    failNextLibraryUpdate: (message) => {
      libraryUpdateFailure = message;
    },
    get settingsOpened() {
      return settingsOpened;
    },
    cancelNextSaveAs: () => {
      cancelSaveAs = true;
    },
    failNextDiscard: (message) => {
      discardFailure = message;
    },
    simulateCapture,
    overlayFrameRequests,
    overlayWindowRequests,
    readyOverlays,
    overlayOutcomes,
    overlayLogs,
    failNextOverlayFrame: (message) => {
      overlayFrameFailure = message;
    },
    get hotkey() {
      return hotkey;
    },
    takenHotkeys,
    settingsLogs,
    setPrintScreenSnipping: (enabled) => {
      snippingEnabled = enabled;
    },
    get printScreenNoticeDismissed() {
      return store.getItem("fake.printScreenNoticeDismissed") === "1";
    },
    get keyboardSettingsOpened() {
      return keyboardSettingsOpened;
    },
    getHotkey: async () => {
      const rawInputFailed = options.rawInputFails === true && hotkey === "PrintScreen";
      return { accelerator: hotkey, registered: !rawInputFailed, rawInputFailed };
    },
    setHotkey: async (accelerator) => {
      if (accelerator === hotkey) return { ok: true };
      if (takenHotkeys.has(accelerator)) return { ok: false, reason: "conflict" };
      hotkey = accelerator;
      store.setItem("fake.hotkey", accelerator);
      return { ok: true };
    },
    getPrintScreenNotice: async () => ({
      snippingEnabled,
      dismissed: store.getItem("fake.printScreenNoticeDismissed") === "1",
    }),
    dismissPrintScreenNotice: async () => store.setItem("fake.printScreenNoticeDismissed", "1"),
    logSettings: async (message) => {
      settingsLogs.push(message);
    },
    openKeyboardSettings: async () => {
      keyboardSettingsOpened++;
    },
    getVersion: async () => options.version ?? "0.0.0-fake",
    openUrl: async (url) => {
      openedUrls.push(url);
    },
    startCapture: async () => simulateCapture(defaultShot()),
    delayedCaptures,
    startDelayedCapture: async (seconds) => {
      delayedCaptures.push(seconds);
    },
    getCountdown: async () => countdown,
    onCountdown: async (handler) => {
      countdownHandlers.add(handler);
      return () => {
        countdownHandlers.delete(handler);
      };
    },
    setCountdown: (remaining) => {
      countdown = remaining;
      countdownHandlers.forEach((handler) => handler(remaining));
    },
    onCapture: async (handler) => {
      handlers.add(handler);
      undelivered.splice(0).forEach(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    copyImage: async (png) => {
      copiedImages.push(png);
    },
    saveToLibrary: async (png, capturedAt) => {
      const stamp = formatStamp(capturedAt);
      let path = `${stamp.slice(0, 7)}\\${stamp}.png`;
      for (let n = 2; libraryFiles.some((f) => f.path === path); n++) {
        path = `${stamp.slice(0, 7)}\\${stamp}-${n}.png`;
      }
      libraryFiles.push({ path, bytes: png });
      writtenAt.set(path, nextWriteTime());
      persistLibrary();
      return path;
    },
    updateLibraryFile: async (path, png) => {
      if (libraryUpdateFailure !== null) {
        const message = libraryUpdateFailure;
        libraryUpdateFailure = null;
        throw new Error(message);
      }
      // Like the real Library: replaces an existing file, never creates one.
      const file = libraryFiles.find((f) => f.path === path);
      if (!file) throw new Error("not a file in the Library");
      file.bytes = png;
      writtenAt.set(path, nextWriteTime());
      libraryUpdates.push({ path, bytes: png });
      persistLibrary();
    },
    listLibrary: async (): Promise<LibraryItem[]> => {
      libraryListings++;
      return libraryFiles.map((f) => {
        const size = readSize(f.bytes);
        return {
          path: f.path,
          modifiedMs: writtenAt.get(f.path) ?? 0,
          createdMs: null,
          bytes: f.bytes.length,
          width: size.width,
          height: size.height,
        };
      });
    },
    readLibraryFile: async (path): Promise<LibraryFile> => {
      const file = libraryFiles.find((f) => f.path === path);
      if (!file) throw new Error("not a file in the Library");
      return { path: file.path, png: file.bytes };
    },
    getThumbnail: async (path) => {
      thumbnailRequests.push(path);
      const file = libraryFiles.find((f) => f.path === path);
      if (!file) throw new Error("not a file in the Library");
      return file.bytes; // the real one is smaller; the picture is the same
    },
    trashLibraryFiles: async (paths) => {
      if (trashFailure !== null) {
        const message = trashFailure;
        trashFailure = null;
        throw new Error(message);
      }
      const moved: string[] = [];
      for (const path of paths) {
        const index = libraryFiles.findIndex((f) => f.path === path);
        if (index < 0) continue;
        stash.set(path, libraryFiles[index]!.bytes);
        libraryFiles.splice(index, 1);
        writtenAt.delete(path);
        trashedPaths.push(path);
        moved.push(path);
      }
      if (moved.length > 0) persistLibrary();
      return moved;
    },
    restoreLibraryFiles: async (paths) => {
      if (restoreFails) {
        restoreFails = false;
        return [];
      }
      const restored: { from: string; to: string }[] = [];
      for (const from of paths) {
        const bytes = stash.get(from);
        if (!bytes) continue;
        let to = from;
        for (let n = 2; libraryFiles.some((f) => f.path === to); n++) to = from.replace(/\.png$/i, `-${n}.png`);
        libraryFiles.push({ path: to, bytes });
        writtenAt.set(to, nextWriteTime());
        stash.delete(from);
        restoredPaths.push(to);
        restored.push({ from, to });
      }
      if (restored.length > 0) persistLibrary();
      return restored;
    },
    forgetTrashedFiles: async (paths) => {
      paths.forEach((p) => stash.delete(p));
    },
    onLibraryChanged: async (handler) => {
      libraryChangeHandlers.add(handler);
      return () => {
        libraryChangeHandlers.delete(handler);
      };
    },
    trashedPaths,
    restoredPaths,
    thumbnailRequests,
    get libraryListings() {
      return libraryListings;
    },
    addLibraryFile: (png, opts = {}) => {
      const stamp = formatStamp(opts.capturedAt ?? new Date());
      let path = opts.path ?? `${stamp.slice(0, 7)}\\${stamp}.png`;
      for (let n = 2; libraryFiles.some((f) => f.path === path); n++) path = path.replace(/(-\d+)?\.png$/i, `-${n}.png`);
      libraryFiles.push({ path, bytes: png });
      writtenAt.set(path, nextWriteTime());
      persistLibrary();
      return path;
    },
    removeLibraryFile: (path) => {
      const index = libraryFiles.findIndex((f) => f.path === path);
      if (index < 0) return;
      libraryFiles.splice(index, 1);
      writtenAt.delete(path);
      persistLibrary();
    },
    failNextTrash: (message) => {
      trashFailure = message;
    },
    failNextRestore: () => {
      restoreFails = true;
    },
    openSettings: async () => {
      settingsOpened++;
    },
    get launchAtSignIn() {
      return store.getItem("fake.launchAtSignIn") !== "0";
    },
    getLaunchAtSignIn: async () => store.getItem("fake.launchAtSignIn") !== "0",
    setLaunchAtSignIn: async (enabled) => {
      if (launchFailure !== null) {
        const message = launchFailure;
        launchFailure = null;
        throw new Error(message);
      }
      store.setItem("fake.launchAtSignIn", enabled ? "1" : "0");
    },
    failNextLaunchAtSignIn: (message) => {
      launchFailure = message;
    },
    libraryFolder: "C:\\Users\\fake\\Pictures\\Screenshot Annotation",
    get libraryFolderOpened() {
      return libraryFolderOpened;
    },
    getLibraryFolder: async () => "C:\\Users\\fake\\Pictures\\Screenshot Annotation",
    openLibraryFolder: async () => {
      libraryFolderOpened++;
    },
    get toolStylesResets() {
      return toolStylesResets;
    },
    resetToolStyles: async () => {
      toolStylesResets++;
      store.setItem("fake.toolStyles", "{}");
      toolStylesResetHandlers.forEach((handler) => handler());
    },
    onToolStylesReset: async (handler) => {
      toolStylesResetHandlers.add(handler);
      return () => {
        toolStylesResetHandlers.delete(handler);
      };
    },
    overlayAttempt: async () => overlayAttempt,
    onOverlayAttempt: async (handler) => {
      overlayAttemptHandlers.add(handler);
      return () => {
        overlayAttemptHandlers.delete(handler);
      };
    },
    setOverlayAttempt: (attempt) => {
      overlayAttempt = attempt;
      overlayAttemptHandlers.forEach((handler) => handler(attempt));
    },
    overlayFrame: async (monitor) => {
      overlayFrameRequests.push(monitor);
      if (overlayFrameFailure !== null) {
        const message = overlayFrameFailure;
        overlayFrameFailure = null;
        throw new Error(message);
      }
      // A small gradient; the overlay stretches it over its window, so only the native size matters.
      const { width, height } = options.overlayFrames?.[monitor] ?? { width: 640, height: 360 };
      const shot = defaultShot();
      return { width, height, png: encodeRgbaPng(shot.width, shot.height, Uint8Array.from(shot.rgba)) };
    },
    overlayWindows: async (monitor) => {
      overlayWindowRequests.push(monitor);
      return options.overlayWindows?.[monitor] ?? [];
    },
    overlayReady: async (monitor) => {
      readyOverlays.push(monitor);
    },
    finishOverlay: async (outcome) => {
      overlayOutcomes.push(outcome);
    },
    logOverlay: async (message, fatal = false) => {
      overlayLogs.push({ message, fatal });
    },
    get magnifier() {
      return store.getItem("fake.magnifier") !== "0";
    },
    getMagnifier: async () => store.getItem("fake.magnifier") !== "0",
    setMagnifier: async (enabled) => {
      store.setItem("fake.magnifier", enabled ? "1" : "0");
      magnifierHandlers.forEach((handler) => handler(enabled));
    },
    onOverlayMagnifier: async (handler) => {
      magnifierHandlers.add(handler);
      return () => {
        magnifierHandlers.delete(handler);
      };
    },
    get imageSettings() {
      return readImageSettings();
    },
    getImageSettings: async () => readImageSettings(),
    setImageBackground: async (background) => {
      writeImageSettings({ ...readImageSettings(), background });
    },
    setCheckerboard: async (checkerboard) => {
      writeImageSettings({ ...readImageSettings(), checkerboard });
    },
    setCalloutTailPercent: async (percent) => {
      if (!inRange(CALLOUT_TAIL_PERCENT, percent)) throw new Error(`${percent} is not a callout tail percentage`);
      writeImageSettings({ ...readImageSettings(), calloutTailPercent: percent });
    },
    setCanvasMargin: async (pixels) => {
      if (!inRange(CANVAS_MARGIN, pixels)) throw new Error(`${pixels} is not a canvas margin`);
      writeImageSettings({ ...readImageSettings(), canvasMargin: pixels });
    },
    setLibraryStripCollapsed: async (collapsed) => {
      writeImageSettings({ ...readImageSettings(), libraryStripCollapsed: collapsed });
    },
    setCropMargin: async (pixels) => {
      if (!inRange(CROP_MARGIN, pixels)) throw new Error(`${pixels} is not a crop margin`);
      writeImageSettings({ ...readImageSettings(), cropMargin: pixels });
    },
    setDarkBackground: async (color) => {
      if (!isDarkBackground(color)) throw new Error(`${color} is not a dark background colour`);
      writeImageSettings({ ...readImageSettings(), darkBackground: color.toLowerCase() });
    },
    setOutsideDarkness: async (percent) => {
      if (!inRange(OUTSIDE_DARKNESS, percent)) throw new Error(`${percent} is not an outside darkness`);
      writeImageSettings({ ...readImageSettings(), outsideDarkness: percent });
    },
    setShowOutsideDefault: async (show) => {
      writeImageSettings({ ...readImageSettings(), showOutsideDefault: show });
    },
    onImageSettings: async (handler) => {
      imageSettingsHandlers.add(handler);
      return () => {
        imageSettingsHandlers.delete(handler);
      };
    },
    get toolStyles() {
      return JSON.parse(store.getItem("fake.toolStyles") ?? "{}") as Record<string, unknown>;
    },
    getToolStyles: async () => JSON.parse(store.getItem("fake.toolStyles") ?? "{}"),
    setToolStyles: async (styles) => {
      store.setItem("fake.toolStyles", JSON.stringify(styles));
    },
    savePngAs: async (png, suggestedName) => {
      if (cancelSaveAs) {
        cancelSaveAs = false;
        return null;
      }
      const path = `C:\\Users\\fake\\Pictures\\${suggestedName}`;
      savedAs.push({ suggestedName, path, bytes: png });
      return path;
    },
    readHistory: async (key) => historyFiles.get(key)?.text ?? null,
    writeHistory: async (key, text) => {
      historyFiles.set(key, { text, modifiedAt: Date.now() });
      persistHistory();
    },
    deleteHistory: async (key) => {
      historyFiles.delete(key);
      persistHistory();
    },
    purgeHistoryBefore: async (cutoffMs) => {
      let purged = 0;
      for (const [key, file] of historyFiles) {
        if (file.modifiedAt < cutoffMs) {
          historyFiles.delete(key);
          purged++;
        }
      }
      if (purged > 0) persistHistory();
      return purged;
    },
    discardLibraryFile: async (path) => {
      if (discardFailure !== null) {
        const message = discardFailure;
        discardFailure = null;
        throw new Error(message);
      }
      const index = libraryFiles.findIndex((f) => f.path === path);
      if (index < 0) throw new Error("not in the Library");
      stash.set(path, libraryFiles[index]!.bytes);
      libraryFiles.splice(index, 1);
      writtenAt.delete(path);
      discardedPaths.push(path);
      persistLibrary();
    },
  };
}
