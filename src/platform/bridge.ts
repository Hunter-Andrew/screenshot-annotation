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
   * already answered the one-time notice.
   */
  getPrintScreenNotice(): Promise<{ snippingEnabled: boolean; dismissed: boolean }>;
  /** Record that the notice was answered so it is never shown again. */
  dismissPrintScreenNotice(): Promise<void>;
  /** Open Windows Settings at Accessibility > Keyboard. */
  openKeyboardAccessibilitySettings(): Promise<void>;
}

export interface HotkeyState {
  accelerator: string;
  /** False when the OS refused the combination at startup (another app has it). */
  registered: boolean;
}

export type SetHotkeyResult =
  | { ok: true }
  | { ok: false; reason: "conflict" | "invalid" | "failed" };
