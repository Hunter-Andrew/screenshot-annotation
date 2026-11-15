import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { formatStamp } from "../shared/stamp";
import type {
  CaptureResult,
  HotkeyState,
  LibraryFile,
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
 * Decode `library_open_latest` (see `pack_library_file` in src-tauri/src/library.rs): u32 LE byte
 * length of the path, the path as UTF-8, then the PNG. Empty means the Library has no image.
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
    openLatestLibraryImage: async () => unpackLibraryFile(await invoke<ArrayBuffer>("library_open_latest")),
    openSettings: () => invoke<void>("open_settings"),
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
    getToolStyles: () => invoke<Record<string, unknown>>("get_tool_styles"),
    setToolStyles: (styles) => invoke<void>("set_tool_styles", { styles }),
    savePngAs: (png, suggestedName) =>
      invoke<string | null>("save_png_as", png, { headers: { "x-suggested-name": suggestedName } }),
    discardLibraryFile: (path) => invoke<void>("library_discard", { path }),
  };
}
