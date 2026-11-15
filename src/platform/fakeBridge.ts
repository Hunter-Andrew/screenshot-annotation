import { encodeRgbaPng } from "../core/png";
import { formatStamp } from "../shared/stamp";
import type { CaptureResult, OverlayOutcome, OverlayRect, PlatformBridge } from "./bridge";

export interface SimulatedShot {
  width: number;
  height: number;
  rgba: ArrayLike<number>;
  capturedAt?: Date;
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
}

/** Fake setting storage; the browser build passes localStorage so e2e reloads keep it. */
export type FakeStorage = Pick<Storage, "getItem" | "setItem">;

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
  const overlayFrameRequests: number[] = [];
  const overlayWindowRequests: number[] = [];
  const readyOverlays: number[] = [];
  const overlayOutcomes: OverlayOutcome[] = [];
  const overlayLogs: { message: string; fatal: boolean }[] = [];
  let overlayFrameFailure: string | null = null;
  const magnifierHandlers = new Set<() => void>();
  const openedUrls: string[] = [];
  const copiedImages: Uint8Array[] = [];
  const libraryFiles: { path: string; bytes: Uint8Array }[] = [];
  const savedAs: FakeBridge["savedAs"] = [];
  const discardedPaths: string[] = [];
  let cancelSaveAs = false;
  let discardFailure: string | null = null;
  const handlers = new Set<(capture: CaptureResult) => void>();
  const undelivered: CaptureResult[] = [];

  const deliver = (capture: CaptureResult) => {
    if (handlers.size === 0) undelivered.push(capture);
    handlers.forEach((handler) => handler(capture));
  };
  const simulateCapture = (shot: SimulatedShot) => {
    deliver({
      width: shot.width,
      height: shot.height,
      capturedAt: shot.capturedAt ?? new Date(),
      png: encodeRgbaPng(shot.width, shot.height, Uint8Array.from(shot.rgba)),
    });
  };

  return {
    openedUrls,
    copiedImages,
    libraryFiles,
    savedAs,
    discardedPaths,
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
    get keyboardSettingsOpened() {
      return keyboardSettingsOpened;
    },
    getHotkey: async () => ({ accelerator: hotkey, registered: true }),
    setHotkey: async (accelerator) => {
      if (accelerator === hotkey) return { ok: true };
      if (takenHotkeys.has(accelerator)) return { ok: false, reason: "conflict" };
      hotkey = accelerator;
      store.setItem("fake.hotkey", accelerator);
      return { ok: true };
    },
    getPrintScreenNotice: async () => ({
      snippingEnabled: options.printScreenSnippingEnabled ?? true,
      dismissed: store.getItem("fake.printScreenNoticeDismissed") === "1",
    }),
    dismissPrintScreenNotice: async () => store.setItem("fake.printScreenNoticeDismissed", "1"),
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
      return path;
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
    toggleOverlayMagnifier: async () => magnifierHandlers.forEach((handler) => handler()),
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
      discardedPaths.push(path);
    },
  };
}
