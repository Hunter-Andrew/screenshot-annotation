# 22: Delay timer

**What to build:** Capture in 3s / 5s / 10s from the tray menu and the editor's top bar shows a countdown near the cursor, then opens the overlay.

**Blocked by:** 05 (Capture overlay: region mode)

**Status:** resolved

- [x] Tray and top-bar entries
- [ ] Countdown shown, then the overlay opens (implemented; the badge window, the pointer following and "not in the picture" are Windows-only, see Comments and the M4 items in `docs/release-checklist.md`)

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Tray: "Capture in 3s / 5s / 10s" items (`tray_menu.rs`, pure and unit-tested). Editor top bar: a "3s 5s 10s" button group next to Capture (`src/editor/DelayCapture.tsx`, tested through the Editor with the fake bridge). Both call the new bridge method `startDelayedCapture(seconds)`; the platform accepts only the numbers in `delay::CHOICES` (checked against `CAPTURE_DELAYS` by `rustParity.test.ts`).
- Flow (`overlay::begin_delayed`): claim the one capture slot, hide the editor at once (so the user can arrange the screen; it comes back after a cancel like after a normal capture), show the countdown, then run the normal capture. While counting down, the hotkey and other captures are ignored.
- The countdown is a small transparent, click-through, non-focusable window (`countdown.rs`, page `src/countdown/Countdown.tsx` at `#countdown`) that follows the pointer every 25 ms, below and right of it, flipping at the right and bottom screen edges (`delay::badge_position`, unit-tested including a monitor left of the primary). It is destroyed and given `HIDE_SETTLE` (150 ms) to leave the screen before the screen is read, so it is never in the picture. If the badge window cannot be created the wait still happens (logged).
- Esc cancels a running countdown (changed after Andrew's review; this replaces the earlier "no way to cancel" decision). The badge is click-through and non-focusable so it cannot receive the key: `countdown::run` registers Esc as a global shortcut through `tauri-plugin-global-shortcut` (RegisterHotKey, no hook, ADR 0007) for the length of the countdown only and unregisters it when it ends, however it ends (`EscapeGuard`, a drop guard). The shortcut handler in `lib.rs` sends Esc to `countdown::cancel` instead of starting a capture. The decision lives in `delay::Countdown` (pure, unit-tested): `cancel()` succeeds only while the countdown is running, `fire()` (time is up) succeeds only if Esc has not won, so an Esc after the capture started is ignored. On a cancel the badge is closed, no capture is taken, `busy` is released and the editor hidden at the start comes back (`overlay::begin_delayed`). If Esc cannot be registered (another app holds it) it is logged and the countdown simply cannot be cancelled. While a countdown runs Esc is taken from other apps (at most 10 s).
- Verified for the cancel: `rustc --test src/delay.rs` (11 tests), `cargo check --target x86_64-pc-windows-gnu`. Not verified (Windows only, step added to "Tray, delay timer and Settings" in `docs/release-checklist.md`): the global Esc registration, the badge closing, the editor coming back, and Esc working again for other apps afterwards.
- Verified on Linux: Vitest, Playwright (`e2e/tray-settings.spec.ts`), the pure Rust modules (`delay.rs`, `tray_menu.rs`) with `rustc --test`, `cargo check --target x86_64-pc-windows-gnu`.
- Not verified (Windows only, "Tray, delay timer and Settings" in `docs/release-checklist.md`): the badge appears next to the pointer on every monitor and scale, never steals focus or clicks, is not in the capture, and the overlay follows.
