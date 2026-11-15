import type { PlatformBridge } from "./bridge";
import { createFakeBridge } from "./fakeBridge";
import { createTauriBridge } from "./tauriBridge";

/**
 * Inside the Tauri webview use the real bridge; in a plain browser (the
 * Playwright e2e tests, `npm run dev`) use the in-memory fake, exposed on
 * `window.__fakeBridge` so tests can observe it.
 */
export function selectBridge(): PlatformBridge {
  if ("__TAURI_INTERNALS__" in window) return createTauriBridge();
  // Dev/e2e hooks: `?printScreenSnipping=off` mimics the Windows value being 0; settings persist in
  // localStorage so a reload keeps them.
  const params = new URLSearchParams(window.location.search);
  // `?overlayWindows={"1":[{"x":..,"y":..,"width":..,"height":..}]}`: windows per monitor for the overlay.
  let overlayWindows;
  try {
    overlayWindows = JSON.parse(params.get("overlayWindows") ?? "null") ?? undefined;
  } catch {
    overlayWindows = undefined;
  }
  const fake = createFakeBridge({
    overlayWindows,
    printScreenSnippingEnabled: params.get("printScreenSnipping") !== "off",
    storage: window.localStorage,
  });
  (window as unknown as { __fakeBridge: unknown }).__fakeBridge = fake;
  return fake;
}
