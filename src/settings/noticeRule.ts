import { usesPrintScreen } from "./hotkey";

/**
 * The one-time "Print Screen opens Snipping Tool" notice. `snippingEnabled` is the backend's reading of
 * HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled (on unless explicitly 0); `dismissed`
 * is whether the user already answered the notice (either button).
 */
export function shouldShowPrintScreenNotice(state: { snippingEnabled: boolean; dismissed: boolean }): boolean {
  return state.snippingEnabled && !state.dismissed;
}

/**
 * The persistent warning under the hotkey field: the hotkey includes Print Screen and Windows still
 * hands that key to Snipping Tool (RegisterHotKey reports success either way, so the registry reading
 * is the only signal). Deliberately takes no "dismissed" input: answering the one-time notice must not
 * silence it, and it disappears by itself once the Windows setting is off.
 */
export function shouldWarnPrintScreenTaken(accelerator: string | null, snippingEnabled: boolean): boolean {
  return accelerator !== null && snippingEnabled && usesPrintScreen(accelerator);
}
