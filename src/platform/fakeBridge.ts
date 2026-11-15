import { encodeRgbaPng } from "../core/png";
import { formatStamp } from "../shared/stamp";
import type { CaptureResult, LibraryFile, OverlayOutcome, OverlayRect, PlatformBridge } from "./bridge";

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
  /** The next `updateLibraryFile` rejects with this message. */
  failNextLibraryUpdate(message: string): void;
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
  /** How many times the Accessibility > Keyboard deep link was opened. */
  readonly keyboardSettingsOpened: number;
  /** Lines the Settings page wrote to the diagnostics log. */
  readonly settingsLogs: string[];
  /** Mimic the user flipping the Windows Print Screen toggle (true = still opens Snipping Tool). */
  setPrintScreenSnipping(enabled: boolean): void;
  /** Whether the one-time Print Screen notice was answered. */
  readonly printScreenNoticeDismissed: boolean;
  /** The stored magnifier setting (`fake.magnifier` in the fake storage; on for a fresh fake). */
  readonly magnifier: boolean;
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
  const magnifierHandlers = new Set<(enabled: boolean) => void>();
  const openedUrls: string[] = [];
  const copiedImages: Uint8Array[] = [];
  const libraryFiles: { path: string; bytes: Uint8Array }[] = [];
  const libraryUpdates: { path: string; bytes: Uint8Array }[] = [];
  // Order in which Library files were last written; the newest is what `openLatestLibraryImage` returns.
  const writtenAt = new Map<string, number>();
  let writeCounter = 0;
  let libraryUpdateFailure: string | null = null;
  let settingsOpened = 0;
  const savedAs: FakeBridge["savedAs"] = [];
  const discardedPaths: string[] = [];
  // With a persistent store (the browser build), Library files survive a page reload, like the real
  // Library survives a restart.
  const persistLibrary = () => {
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
    openKeyboardAccessibilitySettings: async () => {
      keyboardSettingsOpened++;
    },
    getVersion: async () => options.version ?? "0.0.0-fake",
    openUrl: async (url) => {
      openedUrls.push(url);
    },
    startCapture: async () => simulateCapture(defaultShot()),
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
      writtenAt.set(path, ++writeCounter);
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
      writtenAt.set(path, ++writeCounter);
      libraryUpdates.push({ path, bytes: png });
      persistLibrary();
    },
    openLatestLibraryImage: async (): Promise<LibraryFile | null> => {
      const newest = [...libraryFiles].sort((a, b) => (writtenAt.get(b.path) ?? 0) - (writtenAt.get(a.path) ?? 0))[0];
      return newest ? { path: newest.path, png: newest.bytes } : null;
    },
    openSettings: async () => {
      settingsOpened++;
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
    savePngAs: async (png, suggestedName) => {
      if (cancelSaveAs) {
        cancelSaveAs = false;
        return null;
      }
      const path = `C:\\Users\\fake\\Pictures\\${suggestedName}`;
      savedAs.push({ suggestedName, path, bytes: png });
      return path;
    },
    discardLibraryFile: async (path) => {
      if (discardFailure !== null) {
        const message = discardFailure;
        discardFailure = null;
        throw new Error(message);
      }
      const index = libraryFiles.findIndex((f) => f.path === path);
      if (index < 0) throw new Error("not in the Library");
      libraryFiles.splice(index, 1);
      writtenAt.delete(path);
      discardedPaths.push(path);
      persistLibrary();
    },
  };
}
