# 30: Editor opens maximized

**What to build:** The editor window opens maximized by default (Andrew, M2 testing). Maximized, not borderless fullscreen: the title bar and taskbar stay reachable. It is maximized when first created and when shown again after being hidden or closed, from a capture, the tray menu's "Open editor", a left-click on the tray icon and a second app launch. If the user un-maximizes it, later shows respect that for the rest of the session (in memory only; no window geometry is stored on disk). Settings is not maximized.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] The editor is created maximized the first time
- [x] A window the user maximized comes back maximized; one they un-maximized comes back at its normal size (session only, nothing written to disk)
- [x] Capture, tray menu, tray left-click and a second launch all go through `show_editor`, which shows, unminimizes and focuses the window
- [x] A hidden window (ticket 24's pre-warmed editor) is put into the remembered state when shown, and maximized on its first show
- [x] Settings is unchanged (small, fixed size)
- [x] Fit-to-window still fits when the well is large (view tests)
- [ ] On a real Windows machine: opens maximized from a capture, the tray menu, a tray click and a second launch; Settings does not (manual checklist)

## Comments

Pure rule in `src-tauri/src/editor_window.rs` (`should_maximize(last: Option<bool>)`: `None` is true, otherwise the last state), unit tested with `rustc --test`. `lib.rs`: managed `EditorMaximized` (in-memory `Option<bool>`); `show_editor` passes it to `WebviewWindowBuilder::maximized` on creation and, for an existing window that is hidden, maximizes or unmaximizes it to match before `focus`. A visible window is only focused, so a user who is looking at it is never resized. The state is recorded in `hide_editor` (used by `overlay.rs` when it hides the editor for a capture) and on the editor's `CloseRequested` event. Ticket 24 must hide the editor through `hide_editor` too.

Verified on Linux: Rust unit tests for the rule, `cargo check --target x86_64-pc-windows-gnu --tests` with a stub `windres`, vitest (all, including a new large-well case in `src/editor/view.test.ts` and `rustParity.test.ts`), `tsc`.

Not verifiable here (Windows only; added to `docs/release-checklist.md`, Annotate section, "Editor opens maximized"):
- That WebView2 windows really open maximized, that `maximize()` on a hidden window takes effect when it is shown, and that focus lands on the editor from each entry point (capture, tray menu, tray click, second launch).
- That `CloseRequested` fires before the window is destroyed with the maximized flag still readable, and that a minimized-from-maximized window reports the right state.
- That the editor still looks right fitted in a maximized window on the work laptop's monitors and scaling.
