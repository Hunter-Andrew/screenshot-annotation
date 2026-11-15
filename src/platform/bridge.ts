/**
 * The Platform bridge: the single interface the UI calls for every OS service.
 * The real implementation calls Tauri commands (tauriBridge.ts); tests use the
 * in-memory fake (fakeBridge.ts). Later tickets add the rest of Library, hotkey,
 * settings, etc. here.
 */

/** A Capture handed to the editor: a plain PNG of one monitor at native resolution. */
export interface CaptureResult {
  width: number;
  height: number;
  /** When the screen was read; names the Library file. */
  capturedAt: Date;
  png: Uint8Array;
}

/** One monitor frozen at the moment of the hotkey: a plain PNG at the monitor's native resolution. */
export interface OverlayFrame {
  width: number;
  height: number;
  png: Uint8Array;
}

/** What the user did in the capture overlay. Coordinates are native pixels, local to the monitor. */
export type OverlayOutcome =
  | { kind: "region"; monitor: number; region: { x: number; y: number; width: number; height: number } }
  /** Space: the monitor under the mouse pointer (the platform knows where the pointer is). */
  | { kind: "monitor" }
  | { kind: "cancel" };

export interface PlatformBridge {
  /** The installed app version, e.g. "0.1.0". */
  getVersion(): Promise<string>;
  /** Open a URL in the user's default browser. The app itself makes no network calls (ADR 0006). */
  openUrl(url: string): Promise<void>;

  /** Capture the monitor under the cursor (what the hotkey does). The result arrives via `onCapture`. */
  startCapture(): Promise<void>;
  /**
   * Receive Captures, whether they came from the hotkey, the tray or `startCapture`. A Capture
   * taken before the handler was registered (editor window still loading) is delivered too.
   * Returns an unsubscribe function.
   */
  onCapture(handler: (capture: CaptureResult) => void): Promise<() => void>;

  /** Put a plain PNG (an Export) on the clipboard. */
  copyImage(png: Uint8Array): Promise<void>;
  /**
   * Save a new Library PNG as Pictures\Screenshot Annotation\YYYY-MM\YYYY-MM-DD HHmmss.png
   * (never overwriting; a -2, -3 suffix on collision, written atomically). Returns the path.
   */
  saveToLibrary(png: Uint8Array, capturedAt: Date): Promise<string>;

  // Capture overlay (one window per monitor, each showing its frozen frame).
  /** The frozen frame of monitor `monitor` (its index in the platform's monitor list). */
  overlayFrame(monitor: number): Promise<OverlayFrame>;
  /** The overlay of `monitor` has its frame on screen; the platform may now show the window. */
  overlayReady(monitor: number): Promise<void>;
  /** Finish the capture. The platform closes every overlay and delivers the Capture via `onCapture`. */
  finishOverlay(outcome: OverlayOutcome): Promise<void>;
  /** Toggle the magnifier on every overlay (keys reach only the focused overlay window). */
  toggleOverlayMagnifier(): Promise<void>;
  onOverlayMagnifier(handler: () => void): Promise<() => void>;
}
