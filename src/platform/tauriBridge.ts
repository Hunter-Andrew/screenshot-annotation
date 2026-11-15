import { invoke } from "@tauri-apps/api/core";
import type { PlatformBridge } from "./bridge";

/** The real bridge: every call is a Tauri command implemented in src-tauri. */
export function createTauriBridge(): PlatformBridge {
  return {
    getVersion: () => invoke<string>("app_version"),
    openUrl: (url) => invoke<void>("open_url", { url }),
  };
}
