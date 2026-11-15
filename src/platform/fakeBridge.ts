import { encodeRgbaPng } from "../core/png";
import { formatStamp } from "../shared/stamp";
import type { CaptureResult, OverlayOutcome, PlatformBridge } from "./bridge";

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
  /** Deliver a Capture as if the hotkey had been pressed. */
  simulateCapture(shot: SimulatedShot): void;
  /** Monitor indexes whose overlay asked for its frozen frame, in order. */
  readonly overlayFrameRequests: number[];
  /** Monitor indexes whose overlay reported ready, in order. */
  readonly readyOverlays: number[];
  /** What the overlay finished with, in order. */
  readonly overlayOutcomes: OverlayOutcome[];
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
  options: { version?: string; overlayFrames?: Record<number, { width: number; height: number }> } = {},
): FakeBridge {
  const overlayFrameRequests: number[] = [];
  const readyOverlays: number[] = [];
  const overlayOutcomes: OverlayOutcome[] = [];
  const magnifierHandlers = new Set<() => void>();
  const openedUrls: string[] = [];
  const copiedImages: Uint8Array[] = [];
  const libraryFiles: { path: string; bytes: Uint8Array }[] = [];
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
    simulateCapture,
    overlayFrameRequests,
    readyOverlays,
    overlayOutcomes,
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
      // A small gradient; the overlay stretches it over its window, so only the native size matters.
      const { width, height } = options.overlayFrames?.[monitor] ?? { width: 640, height: 360 };
      const shot = defaultShot();
      return { width, height, png: encodeRgbaPng(shot.width, shot.height, Uint8Array.from(shot.rgba)) };
    },
    overlayReady: async (monitor) => {
      readyOverlays.push(monitor);
    },
    finishOverlay: async (outcome) => {
      overlayOutcomes.push(outcome);
    },
    toggleOverlayMagnifier: async () => magnifierHandlers.forEach((handler) => handler()),
    onOverlayMagnifier: async (handler) => {
      magnifierHandlers.add(handler);
      return () => {
        magnifierHandlers.delete(handler);
      };
    },
  };
}
