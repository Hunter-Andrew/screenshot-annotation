/**
 * The one-time "Print Screen opens Snipping Tool" notice. `snippingEnabled` is the backend's reading of
 * HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled (on unless explicitly 0); `dismissed`
 * is whether the user already answered the notice (either button).
 */
export function shouldShowPrintScreenNotice(state: { snippingEnabled: boolean; dismissed: boolean }): boolean {
  return state.snippingEnabled && !state.dismissed;
}
