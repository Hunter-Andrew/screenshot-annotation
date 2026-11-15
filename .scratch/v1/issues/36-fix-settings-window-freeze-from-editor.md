# 36: Fix the Settings window freezing when opened from the editor gear

**What to build:** Andrew (M2 testing, Windows 11 work laptop): clicking the gear in the editor's top bar opens a white window that cannot be closed, and closing it repeatedly makes the whole editor stop responding. Settings from the tray menu works. Opening Settings from the gear must show the Settings page, close normally, and reopen any number of times, and nothing about Settings may block or close the editor. Every code path that creates or shows a window must be safe to run from where it is called.

**Blocked by:** 09 (Side-panel editor and Arrow tool, which added the `open_settings` command and the gear)

**Status:** resolved

- [x] Root cause found in the pinned Tauri, wry and tao sources (see Comments)
- [x] `open_settings` is an `async` command; the tray, tray click, second-launch and first-run paths hand window work to a worker thread; the one other window-creating command (`overlay_log`) is async
- [x] Creating Settings or the editor retries while a just-closed window still holds its label, and looks for an existing window on each try; the old code discarded the `build()` result, which is now logged
- [x] `capture.log` records Settings requested (with its source), created or already open (with the attempt count), focused, close requested, closed, and any creation error
- [x] Structural test `src/shared/windowThreading.test.ts` fails if a `#[tauri::command]` that creates a window (directly or through `show_settings`, `show_editor`, `new_window`, `WebviewWindowBuilder` or a helper that reaches them) is a plain `fn`; shown red on the old code (`open_settings`, `overlay_log`), green now
- [x] Unit: the retry rule (`src-tauri/src/window_open.rs`) under `rustc --test`
- [x] `cargo check --target x86_64-pc-windows-gnu` clean, vitest and `tsc` green
- [x] Release checklist item added (gear and tray, close, reopen several times, editor stays responsive)
- [ ] On a real Windows machine: the gear opens a working Settings window every time and the editor never freezes (manual checklist)

## Comments

2026-11-15 (Claude, implementation):

**Root cause (from source, not reproduced; there is no Windows or WebView2 here).** `open_settings` was a plain `#[tauri::command] fn`. In tauri 2.12.5 a plain `fn` command runs inline in `Webview::on_message`, which wry calls from its IPC handler, that is on the main thread and inside WebView2's `WebMessageReceived` callback. That handler called `show_settings`, which calls `WebviewWindowBuilder::build()`. On the main thread `tauri-runtime-wry`'s `send_user_message` runs the creation directly (`current_thread().id() == main_thread_id`), and wry's WebView2 setup then waits for `CreateCoreWebView2EnvironmentWithOptions` / the controller with `webview2_com::wait_with_pump`, a nested message pump. Doing that from inside another WebView2 callback is the known WebView2 re-entrancy deadlock (wry issue 583). Tauri documents it on `WebviewWindowBuilder::new`, `build` and others: "On Windows, this function deadlocks when used in a synchronous command or event handlers ... You should use `async` commands and separate threads when creating windows." It fits every symptom: the new window exists but its webview never finishes creating (white), the main thread is stuck so the window cannot be closed, and the editor, which shares that thread, stops responding. The tray path works because a tray menu event arrives from the tray's own window message, not from inside a WebView2 callback, so the nested pump finishes; the docs still list event handlers as unsafe, so those paths were moved to worker threads as well.

**Fix.**
- `open_settings` is now `async fn`: it runs on the async runtime's worker thread, which blocks on a channel while the (free) main thread builds the window. Same pattern `overlay_finish` and `save_png_as` already use.
- `request_settings` / `request_editor` (new, in `lib.rs`) spawn a thread for the main-thread callers: tray menu (Open editor, Settings), left click on the tray icon, the single-instance callback (second launch) and the first-run Settings notice in `setup`.
- `overlay_log` was the one other plain `fn` command that can create a window (a fatal overlay page error runs `fail` -> `restore_editor` -> `show_editor`). Now `async`. Found by the new structural test, not by reading.
- Already safe, audited: `overlay::begin` (own thread, so `run`, `open_window` and the watchdog run off the main thread), `start_capture` (only calls `begin`), `overlay_finish` and the other overlay commands (async), `deliver_capture` (called from `overlay_finish`, async), `new_window` (builds nothing, only reads the default icon and sets it on the builder), `on_window_event` (creates nothing; it only reads the editor's maximized state and, new, logs).
- Close/reopen race: Tauri frees a label only when the window is destroyed. `create_or_existing` (used by Settings and the editor) first looks for an existing window, otherwise builds, and on a "label already exists" error pauses (50, 100, 200, 400, 800 ms) and starts over, so a window closed a moment ago is awaited and a double click on the gear ends with one window focused. The `build()` result is no longer discarded; every failure is logged.
- Closing Settings never closes the editor: Settings has no parent, nothing in `on_window_event` or the overlay teardown (`end` destroys only `overlay-*` labels) touches the editor on a Settings close, and the app does not exit on the last window (`prevent_exit`). The new log lines show the Settings close sequence.

**Ruled out as the white page:** the URL and hash (`index.html#settings` is the same string for the tray and the gear, and `rustParity.test.ts` ties it to `SETTINGS_HASH` in `App.tsx`); the CSP (one app-wide `tauri.conf.json` CSP, identical for both paths, and it allows `ipc:`); capabilities (`settings` is in `capabilities/default.json` `windows`, and `core:default` is the same for both paths); the editor being the caller (the bridge is a bare `invoke("open_settings")` with no arguments; the window has no parent and takes no data from the editor); a same-label close race alone (that would give a creation error, not a hang before any page, and it is handled anyway). The tray path using the same URL, CSP and capability and working is what rules out the first three; only the thread the window is created on differs.

**Verified on Linux.** `windowThreading.test.ts` (6 tests; red on the old code for `open_settings` and `overlay_log`, green now), `window_open.rs` unit tests (5, `rustc --test`), full vitest (453 passed), `tsc --noEmit`, `cargo check --target x86_64-pc-windows-gnu` with a stub `x86_64-w64-mingw32-windres` (no errors, no warnings). The gear call is a bridge call, unchanged, so there is no new TypeScript and no e2e change.

**Not verified (Windows only):** that the deadlock really was the cause and is gone (nothing here runs WebView2); that the worker-thread creation shows the Settings page and closes cleanly; the retry on a quick close and reopen; that the log lines appear as described. Added to `docs/release-checklist.md` (Annotate section, "Settings from the editor gear does not freeze"). If it still shows a white window on Windows, `capture.log` now says whether Settings was requested, created or failed, and with which error; send it.
