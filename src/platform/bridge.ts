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
  | { kind: "region"; monitor: number; region: OverlayRect }
  /** A click on a highlighted window: `window` indexes the list `overlayWindows(monitor)` returned. */
  | { kind: "window"; monitor: number; window: number }
  /** Space: the monitor under the mouse pointer (the platform knows where the pointer is). */
  | { kind: "monitor" }
  | { kind: "cancel" };

/** A rectangle in native pixels local to one monitor. */
export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HotkeyState {
  accelerator: string;
  /** False when the OS refused the combination at startup (another app has it). */
  registered: boolean;
}

export type SetHotkeyResult =
  | { ok: true }
  | { ok: false; reason: "conflict" | "invalid" | "failed" };

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
  /**
   * The windows visible on monitor `monitor` at the moment of the hotkey, topmost first, as visible
   * rectangles (no shadow) clipped to that monitor, in native pixels local to it. The overlay
   * hit-tests this list; the platform keeps its own copy and never trusts the index it gets back.
   */
  overlayWindows(monitor: number): Promise<OverlayRect[]>;
  /** The overlay of `monitor` has its frame on screen; the platform may now show the window. */
  overlayReady(monitor: number): Promise<void>;
  /** Finish the capture. The platform closes every overlay and delivers the Capture via `onCapture`. */
  finishOverlay(outcome: OverlayOutcome): Promise<void>;
  /**
   * Write a line to the app's diagnostics log (`capture.log` in the app data folder). With `fatal`
   * the platform also tears every overlay down and tells the user what went wrong. Never throws.
   */
  logOverlay(message: string, fatal?: boolean): Promise<void>;
  /** Toggle the magnifier on every overlay (keys reach only the focused overlay window). */
  toggleOverlayMagnifier(): Promise<void>;
  onOverlayMagnifier(handler: () => void): Promise<() => void>;

  /** The capture hotkey (an accelerator such as "ctrl+shift+s") and whether the OS accepted it. */
  getHotkey(): Promise<HotkeyState>;
  /**
   * Re-register the capture hotkey and save it. If another app owns the combination the old hotkey
   * stays in force and the result says `conflict`.
   */
  setHotkey(accelerator: string): Promise<SetHotkeyResult>;

  /**
   * Whether the Windows setting PrintScreenKeyForSnippingEnabled leaves Print Screen with Snipping
   * Tool (anything but an explicit 0; read-only, the app never writes it), and whether the user
   * already answered the one-time notice. `snippingEnabled` is re-read from the registry on every
   * call, so callers can poll it (e.g. when the Settings window regains focus).
   */
  getPrintScreenNotice(): Promise<{ snippingEnabled: boolean; dismissed: boolean }>;
  /** Record that the notice was answered so it is never shown again. */
  dismissPrintScreenNotice(): Promise<void>;
  /**
   * Write a line to the diagnostics log (`capture.log`) from the Settings page, e.g. what the hotkey
   * recorder received. Never throws.
   */
  logSettings(message: string): Promise<void>;
  /** Open Windows Settings at Accessibility > Keyboard. */
  openKeyboardAccessibilitySettings(): Promise<void>;

  /**
   * Save as PNG…: open the Windows save dialog, suggesting `suggestedName`, and write `png` (a
   * plain Export) where the user chooses. Returns the chosen path, or null if they cancelled.
   */
  savePngAs(png: Uint8Array, suggestedName: string): Promise<string | null>;
  /**
   * Discard: move a Library file (a path `saveToLibrary` returned) to the Windows Recycle Bin.
   * Rejects, leaving the file alone, if it is not inside the Library or could not be moved.
   */
  discardLibraryFile(path: string): Promise<void>;
}
