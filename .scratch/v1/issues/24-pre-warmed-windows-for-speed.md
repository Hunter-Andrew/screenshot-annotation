# 24: Pre-warmed windows for speed

**What to build:** The overlay and editor windows are created at startup and kept hidden (ADR 0003), so the hotkey shows the overlay in under about 150 ms and the editor shows the capture in under about 300 ms after release.

**Blocked by:** 05 (Capture overlay: region mode), 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] Windows are pre-created hidden (implemented; that they really are fast and idle is judged on Windows)
- [x] No automated speed tests; judged on the manual checklist (M4 items under "Speed" in `docs/release-checklist.md`, not run)

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Editor: created hidden at startup on a worker thread (`prewarm_editor`, from `warm_up`, after the tray exists), never destroyed: closing hides it (ticket 23) and `show_editor` shows the loaded window, maximized as before.
- Overlays: one hidden window per monitor at startup (`overlay::prewarm`). The overlay page loads and idles; a capture freezes the screen, moves each window onto its monitor (`place_window`), then emits `overlay-attempt` with the attempt number and each page fetches its frame, as before, and reports ready (which shows the window). When the capture ends the windows are hidden (`end(keep = true)`) and the pages are told `null` so they drop the frame. Which windows to reuse, create on the spot (monitor plugged in since startup) or close (monitor removed) is `warm::plan_overlays` (pure, unit-tested). After a failure the windows are closed and warmed up again.
- Page side: `Overlay` is now a wrapper around `ActiveOverlay` keyed by the attempt number, so each capture starts from clean state (frame, drag, finished flag); a page that loads after the event asks `overlayAttempt()` (tested: idle, begin, end, next capture, double notification, late load). New bridge methods `overlayAttempt` and `onOverlayAttempt`, plus fake and Tauri versions.
- The 5 s "no overlay ever reported ready" watchdog is unchanged.
- `rustParity.test.ts` gained: every command the Tauri bridge invokes is registered in `lib.rs`; events Rust emits match the ones the bridge listens for; the capability covers the new `countdown` window.
- Verified on Linux: Vitest, Playwright, `cargo test` of `warm.rs` in a scratch crate, `cargo check --target x86_64-pc-windows-gnu`.
- Not verified (Windows only): the actual timings; that a hidden WebView2 window reports `document.visibilityState === "hidden"` (the editor's flush and the Library poll pause rely on it, as since ticket 17); that a hidden, always-on-top overlay shows without a flash of its old frame and takes keyboard focus (Esc, Space, M) as a new window did; multi-monitor and DPI changes; idle CPU and memory. All listed under "Speed" and "Tray, delay timer and Settings" in `docs/release-checklist.md`.
