import { encodeRgbaPng } from "../core/png";
import { formatStamp } from "../shared/stamp";
import type { CaptureResult, PlatformBridge } from "./bridge";

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

export function createFakeBridge(options: { version?: string } = {}): FakeBridge {
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
