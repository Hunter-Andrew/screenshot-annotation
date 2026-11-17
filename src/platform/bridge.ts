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
  /**
   * What the platform did with the clipboard when it delivered this Capture: it copies the plain
   * cropped Capture itself, once per new capture ("copied" or "failed"). Absent: it did not try.
   * The editor only reports this; it never copies a new capture on its own.
   */
  clipboard?: "copied" | "failed";
}

/** A Library PNG read back from disk: its path and its bytes (which carry the editable data). */
export interface LibraryFile {
  path: string;
  png: Uint8Array;
}

/**
 * One PNG in the Library folder as the Library Strip and grid need it, without reading the whole file:
 * where it is, its file times, and the pixel size of its visible pixels (the finished image).
 */
export interface LibraryItem {
  path: string;
  /** Last write, ms since the epoch. Together with `bytes` it changes whenever the file does. */
  modifiedMs: number;
  /** When the file was created, ms since the epoch, if the file system says. */
  createdMs: number | null;
  bytes: number;
  width: number;
  height: number;
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
  /** Bare Print Screen only: the Raw Input listener could not start (details in capture.log). */
  rawInputFailed?: boolean;
}

export type SetHotkeyResult =
  | { ok: true }
  | { ok: false; reason: "conflict" | "invalid" | "failed" };

/** The delays the delay timer offers, in seconds (the tray menu lists the same; `src-tauri/src/delay.rs` must match, see rustParity.test.ts). */
export const CAPTURE_DELAYS = [3, 5, 10] as const;

export interface PlatformBridge {
  /** The installed app version, e.g. "0.1.0". */
  getVersion(): Promise<string>;
  /** Open a URL in the user's default browser. The app itself makes no network calls (ADR 0006). */
  openUrl(url: string): Promise<void>;

  /** Capture the monitor under the cursor (what the hotkey does). The result arrives via `onCapture`. */
  startCapture(): Promise<void>;
  /**
   * The delay timer: capture `seconds` from now (one of `CAPTURE_DELAYS`; the platform refuses any other
   * number). Resolves once the countdown has started, not when the Capture arrives. The editor hides at
   * once so the screen can be arranged, a countdown badge follows the mouse pointer, and then the
   * capture overlay opens like after the hotkey.
   */
  startDelayedCapture(seconds: number): Promise<void>;
  /** The number the countdown badge shows now, or null when no countdown is running. */
  getCountdown(): Promise<number | null>;
  /** The countdown number changed (null: it is over). Returns an unsubscribe function. */
  onCountdown(handler: (remaining: number | null) => void): Promise<() => void>;
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
  /**
   * Auto-save: replace the contents of the existing Library PNG at `path` (a path `saveToLibrary` or
   * `openLatestLibraryImage` returned) with `png`, atomically (temp file, then replace). Rejects, and
   * never creates a file, if `path` is not an existing PNG in the Library: an image that was discarded
   * while a save was pending stays gone.
   */
  updateLibraryFile(path: string, png: Uint8Array): Promise<void>;
  /**
   * Every PNG in the Library folder, in no particular order (the folder is the source of truth, ADR
   * 0004: files added or deleted in Explorer show up here). Files that are not PNGs are left out.
   */
  listLibrary(): Promise<LibraryItem[]>;
  /** Read one Library PNG to open it. Rejects if it is gone or is not a PNG in the Library. */
  readLibraryFile(path: string): Promise<LibraryFile>;
  /**
   * A small PNG (longest edge about 460 px) of the image's visible pixels, from a disposable cache in
   * local app data (never under Pictures). Rejects if the file is gone or unreadable.
   */
  getThumbnail(path: string): Promise<Uint8Array>;
  /**
   * Delete from the Library Strip or grid: move each file to the Windows Recycle Bin, with no
   * confirmation. Resolves to the paths that were moved; a file already gone is skipped, not an error.
   * A copy of each is kept for `restoreLibraryFiles` until `forgetTrashedFiles`.
   */
  trashLibraryFiles(paths: string[]): Promise<string[]>;
  /**
   * Undo of a delete (`trashLibraryFiles` or `discardLibraryFile`): put the files back in the Library.
   * Resolves to where each landed (its old path, or a `-2` name if that was taken since).
   */
  restoreLibraryFiles(paths: string[]): Promise<{ from: string; to: string }[]>;
  /** The Undo notice is over: the platform may drop the copies kept for `paths`. */
  forgetTrashedFiles(paths: string[]): Promise<void>;
  /**
   * The Library folder changed: a file was added, removed or replaced, by this app or by anything else
   * (Explorer, OneDrive). Delivers no detail; callers list again. Returns an unsubscribe function.
   */
  onLibraryChanged(handler: () => void): Promise<() => void>;
  /**
   * Undo history files (ticket 13), one per image, in the app's local data folder (never in the PNG).
   * `key` is 64 lowercase hex characters (`contentHash` of the image's path); the text is opaque here.
   * `readHistory` is null when there is no file. `writeHistory` is atomic (temp file, then replace).
   * `deleteHistory` is a no-op when there is none. `purgeHistoryBefore` deletes every history file last
   * written before `cutoffMs` (ms since the epoch) and returns how many it deleted.
   */
  readHistory(key: string): Promise<string | null>;
  writeHistory(key: string, text: string): Promise<void>;
  deleteHistory(key: string): Promise<void>;
  purgeHistoryBefore(cutoffMs: number): Promise<number>;
  /** Open the Settings window (the editor's gear button). */
  openSettings(): Promise<void>;
  /** Launch at sign-in (default on): start the app, into the tray, when the user signs in to Windows. */
  getLaunchAtSignIn(): Promise<boolean>;
  /** Turn launch at sign-in on or off. Rejects, leaving it as it was, if Windows refuses the change. */
  setLaunchAtSignIn(enabled: boolean): Promise<void>;
  /** The Library folder (read-only here: it is where captures are saved, not a setting). */
  getLibraryFolder(): Promise<string>;
  /** Show the Library folder in Windows Explorer (made first if it does not exist yet). */
  openLibraryFolder(): Promise<void>;
  /**
   * Reset tool styles: forget every tool's sticky style and its "return to Select" choice, so each tool
   * starts from its default again. The stored styles are cleared and every window that holds some
   * (the editor) is told through `onToolStylesReset`.
   */
  resetToolStyles(): Promise<void>;
  /** The stored tool styles were reset (from any window). Returns an unsubscribe function. */
  onToolStylesReset(handler: () => void): Promise<() => void>;

  // Capture overlay (one window per monitor, each showing its frozen frame).
  /** The frozen frame of monitor `monitor` (its index in the platform's monitor list). */
  overlayFrame(monitor: number): Promise<OverlayFrame>;
  /**
   * The windows visible on monitor `monitor` at the moment of the hotkey, topmost first, as visible
   * rectangles (no shadow) clipped to that monitor, in native pixels local to it. The overlay
   * hit-tests this list; the platform keeps its own copy and never trusts the index it gets back.
   */
  overlayWindows(monitor: number): Promise<OverlayRect[]>;
  /**
   * Overlay windows are created at startup and kept hidden (ADR 0003), so a page cannot assume that
   * it was opened for a capture. The capture attempt this overlay should show now, or null while it
   * sits idle and hidden. Ask once when the page has loaded; later changes arrive via `onOverlayAttempt`.
   */
  overlayAttempt(): Promise<number | null>;
  /**
   * A capture began (the attempt number: show your monitor's frame) or ended (null: drop it and go back
   * to idle). Returns an unsubscribe function.
   */
  onOverlayAttempt(handler: (attempt: number | null) => void): Promise<() => void>;
  /** The overlay of `monitor` has its frame on screen; the platform may now show the window. */
  overlayReady(monitor: number): Promise<void>;
  /** Finish the capture. The platform closes every overlay and delivers the Capture via `onCapture`. */
  finishOverlay(outcome: OverlayOutcome): Promise<void>;
  /**
   * Write a line to the app's diagnostics log (`capture.log` in the app data folder). With `fatal`
   * the platform also tears every overlay down and tells the user what went wrong. Never throws.
   */
  logOverlay(message: string, fatal?: boolean): Promise<void>;
  /**
   * Whether the capture overlay shows its magnifier: a stored setting (default true on a fresh
   * install) that each overlay reads when it starts and the Settings window can change too.
   */
  getMagnifier(): Promise<boolean>;
  /**
   * Store the magnifier setting at once and tell every overlay (and Settings) the new value via
   * `onOverlayMagnifier`. If the platform cannot write the file it keeps the value in memory for
   * this run and logs the failure; the overlay is never broken by it.
   */
  setMagnifier(enabled: boolean): Promise<void>;
  /** The magnifier setting changed (from any window); delivers the new value, not a toggle. */
  onOverlayMagnifier(handler: (enabled: boolean) => void): Promise<() => void>;

  /**
   * Each tool's last style (the "sticky" styles), keyed by Annotation type, stored in settings.json so
   * they survive a restart. Opaque to the platform: the editor validates what it reads
   * (`sanitizeStyle`). An empty object on a fresh install or an older settings file.
   */
  getToolStyles(): Promise<Record<string, unknown>>;
  /** Replace the stored tool styles (all tools at once). A failed write is logged and kept in memory for this run. */
  setToolStyles(styles: Record<string, unknown>): Promise<void>;

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
  /**
   * Open Windows Settings at Bluetooth & devices (`ms-settings:bluetooth`, the closest documented page);
   * the user clicks on to Keyboard. Not the Accessibility > Keyboard page.
   */
  openKeyboardSettings(): Promise<void>;

  /**
   * Save as PNG…: open the Windows save dialog, suggesting `suggestedName`, and write `png` (a
   * plain Export) where the user chooses. Returns the chosen path, or null if they cancelled.
   */
  savePngAs(png: Uint8Array, suggestedName: string): Promise<string | null>;
  /**
   * Discard: move a Library file (a path `saveToLibrary` returned) to the Windows Recycle Bin (and, like
   * `trashLibraryFiles`, keep a copy for `restoreLibraryFiles`).
   * Rejects, leaving the file alone, if it is not inside the Library or could not be moved.
   */
  discardLibraryFile(path: string): Promise<void>;
}
