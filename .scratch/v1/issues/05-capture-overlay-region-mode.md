# 05: Capture overlay: region mode

**What to build:** The hotkey freezes all monitors and shows an overlay on each one. Andrew drags a region, which stops at the edge of the starting monitor, and releasing captures it immediately. Space captures the whole monitor under the cursor; Esc cancels. The overlay shows crosshair guides, dims outside the selection, shows the pixel size, and has a magnifier toggled with M.

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** resolved

- [ ] Works across 3 monitors with negative virtual-screen coordinates (manual checklist)
- [x] The region clamps to the starting monitor
- [ ] Space and Esc behave as described
- [x] Magnifier toggles with M; pixel size shown
- [ ] The result opens in the editor and is saved to the Library

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

Implemented on branch `worktree-agent-afb3da0410f62a93f`. Verified on Linux: vitest (selection geometry, Overlay component through the fake bridge), Playwright (overlay route in a real browser at a 2x scale), `rustc --test src-tauri/src/geometry.rs` (monitor lookup with negative coordinates, region clamp, crop), `tsc`, and `cargo check --target x86_64-pc-windows-gnu`.

Ticked:
- Clamp: the logic (CSS clamp, physical scaling, server-side re-clamp) is tested. Whether the real WebView2 keeps reporting pointer positions past the window edge (pointer capture) is on the release checklist.
- Magnifier/pixel size: toggling and the size label are tested in jsdom and Chromium. That the magnifier pixels look right on a real screen is on the release checklist.

Not ticked, Windows-only and unverifiable here (all on `docs/release-checklist.md`, Capture section):
- 3 monitors with negative coordinates: window placement (`set_position` then `set_size` in physical pixels, mixed DPI), GDI capture per monitor.
- Space and Esc: the UI half is tested; Space's "monitor under the pointer" uses `GetCursorPos` and keyboard focus on the overlay under the pointer, which only a real run shows.
- Result opens in the editor and is saved: the Rust crop/encode/`deliver_capture` path is compiled but not run; the editor and Library half was already covered by ticket 04's tests.

Known limits: overlay windows are created per capture, not pre-warmed (ticket 24, ADR 0003), so the 150 ms target is likely missed until then; frames reach the overlay as fast-compressed PNG. Window mode (ticket 06) and the delay timer (ticket 22) are not part of this ticket.
