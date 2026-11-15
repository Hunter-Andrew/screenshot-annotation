import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { formatStamp } from "../shared/stamp";
import type { CaptureResult, PlatformBridge } from "./bridge";

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
    copyImage: (png) => invoke<void>("copy_image", png),
    saveToLibrary: (png, capturedAt) =>
      invoke<string>("library_save", png, { headers: { "x-captured-at": formatStamp(capturedAt) } }),
    savePngAs: (png, suggestedName) =>
      invoke<string | null>("save_png_as", png, { headers: { "x-suggested-name": suggestedName } }),
    discardLibraryFile: (path) => invoke<void>("library_discard", { path }),
  };
}
