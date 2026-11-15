# 25: Auto-copy each new capture to the clipboard

**What to build:** When a capture finishes, the editor opens as before and the capture is also put on the clipboard automatically, so Andrew can capture, switch to Teams, Outlook or Paint, and paste without touching the editor. The clipboard holds a plain PNG of the Capture as cropped by the selection (an Export: no embedded `snAP` chunk, nothing beyond what is visible, ADR 0002 and 0004). A clipboard failure never breaks the capture: the Library save and the editor opening still happen. The editor shows "Copied to clipboard" on success, or a small status line saying it could not copy (see `capture.log`). The Copy button keeps working. Copy happens once per new capture only, never on re-opening the editor or switching images.

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** resolved

- [x] Unit tests (written first): `unpackCapture` reads the clipboard outcome byte (`src/platform/tauriBridge.test.ts`); the Editor reports "Copied to clipboard" or the failure next to the Library save, never writes the clipboard itself for a new capture, is not re-copied by a new arrival or an image switch, still saves and shows the image when the copy failed, and the Copy button still writes a plain Export (`src/editor/Editor.test.tsx`; vitest, 115 passing)
- [x] Wire format (Rust test): the `take_capture` header carries the outcome byte and matches the TS decoder (`src-tauri/src/capture_wire.rs`, 2 passing under `rustc --test`)
- [x] E2E with the fake bridge: a new capture is on the fake clipboard as a plain PNG with the right pixels and the editor says so (`e2e/capture-copy.spec.ts`, Playwright, 16 passing)
- [x] The clipboard write goes through the same `png_guard::require_plain_png` check as Copy (shared `write_plain_png_to_clipboard` in `src-tauri/src/lib.rs`; `png_guard.rs` tests 5 passing; `cargo check` and `cargo clippy --target x86_64-pc-windows-gnu` clean)
- [ ] Manual: capture, switch to Teams, Outlook and Paint, paste works without pressing Copy (unverified: Windows only; on `docs/release-checklist.md` under M1)

Spec: `.scratch/snagit-clone/spec.md` (Copy and save, stories 82 to 84; Export safety).

## Comments

- Where it lives: Rust, in `deliver_capture`, not the editor. That function already holds the plain cropped Capture PNG and runs before the editor window exists, so the copy works even if the editor fails to load, needs no round trip through the page, and reuses the exact code path and `png_guard` plain-PNG check of `copy_image` (both now call `write_plain_png_to_clipboard`). It runs once per delivered capture by construction; the editor only reads the outcome, so re-opening or switching images cannot copy or steal the clipboard.
- Outcome reaches the editor in the `take_capture` header (one new byte: 0 not tried, 1 copied, 2 failed), so it is not lost when the capture itself creates the editor window. `pack_capture` moved to the pure module `capture_wire.rs` so it is testable off Windows. The failure detail goes to `capture.log` (`capture could not be copied to the clipboard: ...`), the editor shows only "Could not copy to the clipboard (see capture.log)".
- Cost: the copy happens before the editor is shown, so it adds the PNG decode and clipboard write (expected tens of ms) to release-to-editor time. Judge it in the existing speed items; if too slow, the copy can move to a thread while the outcome is sent as a second event.
- Verified on Linux: vitest, Playwright, `tsc --noEmit`, `rustc --test` on `capture_wire.rs` and `png_guard.rs`, `cargo check` and `cargo clippy --target x86_64-pc-windows-gnu` of the Tauri crate (stub `windres`).
- Unverified, Windows only: the actual clipboard write by `tauri-plugin-clipboard-manager` from `deliver_capture` (pixel and transparency fidelity, Teams/Outlook/Paint paste), that the overlay-to-editor flow carries the outcome byte through real IPC, the added latency, and the `capture.log` lines. `cargo test` of the whole Tauri crate cannot build here (no gtk), so only the pure modules were run.
