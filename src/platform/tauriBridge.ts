import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { sanitizeImageSettings } from "../shared/imageSettings";
import { formatStamp } from "../shared/stamp";
import { watchLibrary } from "./libraryWatch";
import type {
  CaptureResult,
  HotkeyState,
  LibraryFile,
  LibraryItem,
  OverlayFrame,
  OverlayRect,
  PlatformBridge,
} from "./bridge";

/**
 * Decode the `take_capture` body (see `pack_capture` in src-tauri/src/lib.rs): u32 LE width,
 * u32 LE height, f64 LE capture time in ms since the epoch, one byte for the automatic clipboard
 * copy (0 not tried, 1 copied, 2 failed), then the PNG. Empty means none.
 */
export function unpackCapture(reply: ArrayBuffer): CaptureResult | null {
  const body = asBuffer(reply);
  if (body.byteLength < 17) return null;
  const view = new DataView(body);
  return {
    width: view.getUint32(0, true),
    height: view.getUint32(4, true),
    capturedAt: new Date(view.getFloat64(8, true)),
    clipboard: ([undefined, "copied", "failed"] as const)[new Uint8Array(body)[16]!],
    png: new Uint8Array(body, 17),
  };
}

/** Decode `overlay_frame` (see `pack_frame` in src-tauri/src/overlay.rs): u32 LE width, u32 LE height, then the PNG. */
/**
 * A binary reply is an ArrayBuffer when Tauri's fetch-based IPC works. If the webview refuses that
 * (a CSP without `connect-src ipc: http://ipc.localhost`), Tauri silently falls back to postMessage
 * and the same reply arrives as a plain array of byte values; accept both rather than fail.
 */
function asBuffer(reply: unknown): ArrayBuffer {
  if (reply instanceof ArrayBuffer) return reply;
  if (ArrayBuffer.isView(reply)) return new Uint8Array(reply.buffer, reply.byteOffset, reply.byteLength).slice().buffer;
  if (Array.isArray(reply)) return Uint8Array.from(reply).buffer;
  throw new Error(`unexpected reply from the app (${typeof reply})`);
}

/**
 * Decode `library_read` (see `pack_library_file` in src-tauri/src/library.rs): u32 LE byte
 * length of the path, the path as UTF-8, then the PNG. Empty means no file.
 */
export function unpackLibraryFile(reply: ArrayBuffer): LibraryFile | null {
  const body = asBuffer(reply);
  if (body.byteLength < 4) return null;
  const pathLength = new DataView(body).getUint32(0, true);
  const path = new TextDecoder().decode(new Uint8Array(body, 4, pathLength));
  return { path, png: new Uint8Array(body, 4 + pathLength) };
}

export function unpackFrame(reply: ArrayBuffer): OverlayFrame {
  const body = asBuffer(reply);
  if (body.byteLength < 8) throw new Error("no frozen frame for this monitor");
  const view = new DataView(body);
  return { width: view.getUint32(0, true), height: view.getUint32(4, true), png: new Uint8Array(body, 8) };
}

/** The real bridge: every call is a Tauri command implemented in src-tauri. */
export function createTauriBridge(): PlatformBridge {
  const takeCapture = async () => unpackCapture(await invoke<ArrayBuffer>("take_capture"));
  return {
    getVersion: () => invoke<string>("app_version"),
    openUrl: (url) => invoke<void>("open_url", { url }),
    startCapture: () => invoke<void>("start_capture"),
    startDelayedCapture: (seconds) => invoke<void>("start_delayed_capture", { seconds }),
    getCountdown: () => invoke<number | null>("countdown_remaining"),
    onCountdown: (handler) =>
      listen<number | null>("countdown", (event) => handler(typeof event.payload === "number" ? event.payload : null)),
    onCapture: async (handler) => {
      const deliverPending = async () => {
        const capture = await takeCapture();
        if (capture) handler(capture);
      };
      const unlisten = await listen("capture-ready", deliverPending);
      // The editor window may have been created by the capture itself, after the event fired.
      await deliverPending();
      return unlisten;
    },
    getHotkey: () => invoke<HotkeyState>("get_hotkey"),
    setHotkey: async (accelerator) => {
      try {
        await invoke<void>("set_hotkey", { accelerator });
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e === "conflict" || e === "invalid" ? e : "failed" };
      }
    },
    getPrintScreenNotice: () =>
      invoke<{ snippingEnabled: boolean; dismissed: boolean }>("get_print_screen_notice"),
    dismissPrintScreenNotice: () => invoke<void>("dismiss_print_screen_notice"),
    logSettings: async (message) => {
      try {
        await invoke<void>("settings_log", { message });
      } catch {
        console.error(message);
      }
    },
    openKeyboardSettings: () => invoke<void>("open_keyboard_settings"),
    copyImage: (png) => invoke<void>("copy_image", png),
    saveToLibrary: (png, capturedAt) =>
      invoke<string>("library_save", png, { headers: { "x-captured-at": formatStamp(capturedAt) } }),
    // The path travels in a header, which cannot carry arbitrary characters: percent-encode it.
    updateLibraryFile: (path, png) =>
      invoke<void>("library_update", png, { headers: { "x-library-path": encodeURIComponent(path) } }),
    listLibrary: () => invoke<LibraryItem[]>("library_list"),
    readLibraryFile: async (path) => {
      const file = unpackLibraryFile(await invoke<ArrayBuffer>("library_read", { path }));
      if (!file) throw new Error("not a file in the Library");
      return file;
    },
    getThumbnail: async (path) => new Uint8Array(asBuffer(await invoke<ArrayBuffer>("library_thumbnail", { path }))),
    trashLibraryFiles: (paths) => invoke<string[]>("library_trash", { paths }),
    restoreLibraryFiles: (paths) => invoke<{ from: string; to: string }[]>("library_restore", { paths }),
    forgetTrashedFiles: (paths) => invoke<void>("library_forget", { paths }),
    onLibraryChanged: async (handler) =>
      watchLibrary({ readSignature: () => invoke<string>("library_signature"), onChange: handler }),
    readHistory: (key) => invoke<string | null>("history_read", { key }),
    writeHistory: (key, text) => invoke<void>("history_write", { key, text }),
    deleteHistory: (key) => invoke<void>("history_delete", { key }),
    purgeHistoryBefore: (cutoffMs) => invoke<number>("history_purge_before", { cutoffMs }),
    openSettings: () => invoke<void>("open_settings"),
    getLaunchAtSignIn: () => invoke<boolean>("get_launch_at_sign_in"),
    setLaunchAtSignIn: (enabled) => invoke<void>("set_launch_at_sign_in", { enabled }),
    getLibraryFolder: () => invoke<string>("library_folder"),
    openLibraryFolder: () => invoke<void>("open_library_folder"),
    resetToolStyles: () => invoke<void>("reset_tool_styles"),
    onToolStylesReset: (handler) => listen("tool-styles-reset", () => handler()),
    overlayAttempt: () => invoke<number | null>("overlay_attempt"),
    onOverlayAttempt: (handler) =>
      listen<number | null>("overlay-attempt", (event) => handler(typeof event.payload === "number" ? event.payload : null)),
    overlayFrame: async (monitor) => unpackFrame(await invoke<ArrayBuffer>("overlay_frame", { monitor })),
    overlayWindows: (monitor) => invoke<OverlayRect[]>("overlay_windows", { monitor }),
    overlayReady: (monitor) => invoke<void>("overlay_ready", { monitor }),
    finishOverlay: (outcome) => invoke<void>("overlay_finish", { outcome }),
    logOverlay: async (message, fatal = false) => {
      try {
        await invoke<void>("overlay_log", { message, fatal });
      } catch {
        // Reporting must never throw; the console is all that is left.
        console.error(message);
      }
    },
    getMagnifier: () => invoke<boolean>("get_magnifier"),
    setMagnifier: (enabled) => invoke<void>("set_magnifier", { enabled }),
    onOverlayMagnifier: (handler) => listen<boolean>("overlay-magnifier", (event) => handler(event.payload === true)),
    getImageSettings: async () => sanitizeImageSettings(await invoke<unknown>("get_image_settings")),
    setImageBackground: (background) => invoke<void>("set_image_background", { background }),
    setCheckerboard: (theme) => invoke<void>("set_checkerboard", { theme }),
    setCanvasMargin: (pixels) => invoke<void>("set_canvas_margin", { pixels }),
    setLibraryStripCollapsed: (collapsed) => invoke<void>("set_library_strip_collapsed", { collapsed }),
    setCropMargin: (pixels) => invoke<void>("set_crop_margin", { pixels }),
    setDarkBackground: (color) => invoke<void>("set_dark_background", { color }),
    setOutsideDarkness: (percent) => invoke<void>("set_outside_darkness", { percent }),
    setShowOutsideDefault: (show) => invoke<void>("set_show_outside_default", { show }),
    onImageSettings: (handler) => listen<unknown>("image-settings", (event) => handler(sanitizeImageSettings(event.payload))),
    getToolStyles: () => invoke<Record<string, unknown>>("get_tool_styles"),
    setToolStyles: (styles) => invoke<void>("set_tool_styles", { styles }),
    getShortcutOverrides: () => invoke<Record<string, unknown>>("get_shortcut_overrides"),
    setShortcutOverrides: (overrides) => invoke<void>("set_shortcut_overrides", { overrides }),
    savePngAs: (png, suggestedName) =>
      invoke<string | null>("save_png_as", png, { headers: { "x-suggested-name": suggestedName } }),
    discardLibraryFile: (path) => invoke<void>("library_discard", { path }),
  };
}
