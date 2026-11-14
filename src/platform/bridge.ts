/**
 * The Platform bridge: the single interface the UI calls for every OS service.
 * The real implementation calls Tauri commands (tauriBridge.ts); tests use the
 * in-memory fake (fakeBridge.ts). Later tickets add capture, clipboard, Library,
 * hotkey, settings, etc. here.
 */
export interface PlatformBridge {
  /** The installed app version, e.g. "0.1.0". */
  getVersion(): Promise<string>;
  /** Open a URL in the user's default browser. The app itself makes no network calls (ADR 0006). */
  openUrl(url: string): Promise<void>;
}
