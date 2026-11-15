import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { formatStamp } from "../shared/stamp";
import type { CaptureResult, HotkeyState, OverlayFrame, OverlayRect, PlatformBridge } from "./bridge";

/**
 * Decode the `take_capture` body (see `pack_capture` in src-tauri/src/lib.rs): u32 LE width,
 * u32 LE height, f64 LE capture time in ms since the epoch, then the PNG. Empty means none.
 */
export function unpackCapture(body: ArrayBuffer): CaptureResult | null {
  if (body.byteLength < 16) return null;
  const view = new DataView(body);
  return {
    width: view.getUint32(0, true),
    height: view.getUint32(4, true),
    capturedAt: new Date(view.getFloat64(8, true)),
    png: new Uint8Array(body, 16),
  };
}

/** Decode `overlay_frame` (see `pack_frame` in src-tauri/src/overlay.rs): u32 LE width, u32 LE height, then the PNG. */
export function unpackFrame(body: ArrayBuffer): OverlayFrame {
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
    openKeyboardAccessibilitySettings: () => invoke<void>("open_keyboard_accessibility_settings"),
    copyImage: (png) => invoke<void>("copy_image", png),
    saveToLibrary: (png, capturedAt) =>
      invoke<string>("library_save", png, { headers: { "x-captured-at": formatStamp(capturedAt) } }),
    overlayFrame: async (monitor) => unpackFrame(await invoke<ArrayBuffer>("overlay_frame", { monitor })),
    overlayWindows: (monitor) => invoke<OverlayRect[]>("overlay_windows", { monitor }),
    overlayReady: (monitor) => invoke<void>("overlay_ready", { monitor }),
    finishOverlay: (outcome) => invoke<void>("overlay_finish", { outcome }),
    toggleOverlayMagnifier: () => invoke<void>("overlay_toggle_magnifier"),
    onOverlayMagnifier: (handler) => listen("overlay-magnifier", () => handler()),
    savePngAs: (png, suggestedName) =>
      invoke<string | null>("save_png_as", png, { headers: { "x-suggested-name": suggestedName } }),
    discardLibraryFile: (path) => invoke<void>("library_discard", { path }),
  };
}
