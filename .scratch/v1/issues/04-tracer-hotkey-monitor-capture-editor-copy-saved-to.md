# 04: Tracer: hotkey → monitor capture → editor → Copy, saved to Library

**What to build:** Andrew presses Ctrl+Shift+S, and the monitor under the cursor is captured at native resolution without the cursor. The editor shows it, and Copy puts a plain PNG on the clipboard. The capture is saved immediately as a Library PNG in Pictures\Screenshot Annotation\YYYY-MM\, named by capture time, with the Capture and an empty Annotation model embedded. This introduces the Annotated Image core (create, encode, decode, Export).

**Blocked by:** 01 (Installable tray app with About)

**Status:** resolved

- [x] Unit tests (written first): encode/decode round-trip; visible pixels equal the finished image; Export has no embedded chunk or Capture; plain PNG decodes as an Annotated Image with no Annotations (`src/core/annotatedImage.test.ts`, vitest, passing)
- [x] Writes are atomic (temp file, then replace); names get a -2, -3 suffix on collision (Rust test) (`src-tauri/src/library.rs` tests, 6 passing under `rustc --test`; see Comments)
- [x] E2E with the fake bridge: a capture appears in the editor and Copy writes a plain PNG to the fake clipboard (`e2e/capture-copy.spec.ts`, Playwright, passing)
- [ ] Manual: paste into Teams and Outlook works (unverified: Windows only; on `docs/release-checklist.md` under M1)

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

- Verified on Linux: vitest (20 tests), Playwright (3), `tsc --noEmit`, the pure Rust modules `library.rs` (`rustc --test`) and `capture_image.rs` (cargo test in a scratch crate), and `cargo check` and `cargo clippy --target x86_64-pc-windows-gnu` of the Tauri crate (using a stub `windres`, since the build script needs one). `cargo test` of the whole Tauri crate cannot build here (no gtk), so the `pack_capture` test in `lib.rs` and the `url_guard` tests only run in Windows CI.
- Unverified, Windows only: the GDI capture itself (`src-tauri/src/capture.rs`: monitor under cursor, no cursor, native pixels on a scaled monitor), the global hotkey, the clipboard write via `tauri-plugin-clipboard-manager` (Teams/Outlook paste), the Tauri IPC path (`take_capture` wire format, raw-bytes `copy_image` / `library_save` with the `x-captured-at` header), the editor window being created and fed by the capture, and hiding the editor before capturing (fixed 150 ms settle, may need tuning). Added to the M1 release checklist.
- Design: the Annotated Image core is TS (`src/core/`); Rust only captures, writes files and sets the clipboard. Flow: Rust captures, parks the packed Capture in `PendingCapture` and emits `capture-ready`; the editor calls `take_capture`, builds the Annotated Image, calls `library_save` with the Library PNG, and `copy_image` with the Export. Parking it means a capture that creates the editor window is not lost.
- Embedded data is a private PNG chunk `snAP` holding a length-prefixed JSON model plus the Capture PNG. M1 can only encode an empty model; `renderFinished` throws if Annotations or a Crop exist until the renderer lands in M2.
- Tray gained "Capture" and "Open editor" and left-click opens the editor; ticket 23 still owns the full tray. The hotkey is fixed at Ctrl+Shift+S (ticket 08 makes it configurable); a taken hotkey only logs, it does not stop startup.
- Library files live under Pictures (`picture_dir()`), not app data; nothing was added to the app-data folders yet.
