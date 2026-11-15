# 09: Side-panel editor and Arrow tool

**What to build:** The editor uses layout A: the top bar (Discard, Save as PNG…, Copy, ⚙), the tool column on the left with shortcut keys, the Style panel on the right, and the canvas in a neutral well. Andrew draws straight arrows (one head by default, or both), selects them, and moves or resizes them. Edits auto-save about 1 s later into the Library PNG, and reopening the image shows them still editable. This introduces the app-owned Annotation model with the Stroke and Arrowheads groups (ADR 0005).

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** resolved

- [x] Unit: Arrow Annotations round-trip through encode/decode
- [x] E2E: draw an arrow, move it, reload, and it is still editable
- [x] V and A shortcuts work; Esc deselects
- [x] Auto-save is debounced about 1 s

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15 (Andrew, from M1 testing on the work laptop): vertical scrolling in the editor feels a little off. Deliberately not fixed in M1 because this ticket replaces the editor layout. When building the side-panel editor, check how the Capture scrolls and fits vertically (tall Captures, window resize, scroll position when switching images) and make it feel right.

2026-11-15 (Claude, implementation):

**Scrolling and fit (Andrew's note).** Found one real cause and fixed the rest by design:
- The M1 editor was `height: 100vh` inside a body with the default 8 px margin, so the whole window scrolled 16 px and the status line sat half off the bottom. The editor is now pinned to the window (`position: fixed; inset: 0`); only the well scrolls.
- A tall Capture used to be shown at full width and scrolled; now **Fit** is the default: the whole image is shown, scaled down to the well but never enlarged past 100%, so a tall Capture needs no scrolling. A window resize refits. "100%", Zoom in/out and Ctrl+wheel (also Ctrl+0, Ctrl+1, Ctrl+=, Ctrl+-) zoom; the middle of the view stays put, and the well then scrolls from the very top to the very bottom (the image is centred with `margin: auto`, never `place-items: center`, which would clip the top of an overflowing image out of reach). Showing another image (new capture, Discard) starts at Fit, scrolled to the top-left.
- Tests: `src/editor/view.test.ts` (the maths) and the "fit and scroll" group in `e2e/annotate.spec.ts` (real layout in Chromium: tall Capture fits with no scroll, resize refits, 100% reaches top and bottom, zoom keeps the centre, switching images resets, the page itself never scrolls, drawing while zoomed and scrolled lands under the pointer).

**What was built (extension points for tickets 10-13).**
- Model: `src/core/annotation.ts` (`Annotation` union, `AnnotationModel`), `src/core/propertyGroups.ts` (Stroke, Arrowheads; `Style`), `src/core/annotations/<type>.ts` plus the registry `annotations/index.ts` (`AnnotationKind`: label, shortcut action id, groups, default style, `fromDrag`). Edits: `src/core/editSession.ts` (`Edit` = add | update, `applyEdit`, `EditSession`). `apply` is the single choke point: ticket 13 hooks undo/redo there and adds `delete`/`reorder` to `Edit`; ticket 21 adds `setCrop`.
- New tool = (1) `core/annotations/<type>.ts` + one line in `annotations/index.ts` and in the `Annotation` union; (2) `canvas/shapes/<type>.ts` (a `ShapeAdapter`: create / update / read) + one line in `canvas/shapes/index.ts`; the same adapter draws the Export. Its shortcut row is already in `src/editor/shortcuts.ts`; its tool-column button and Style panel come from the kind. New property group = type in `propertyGroups.ts` + an editor in `src/editor/style/groups.tsx`. The commented placeholder lines in those files mark where each ticket adds its line (kept apart to avoid merge conflicts).
- Fabric is behind the `CanvasKit` seam (`src/canvas/types.ts`, `kit.ts`): the editor's jsdom tests use `src/canvas/stubKit.ts`; the real canvas is tested in Playwright.
- Export: `renderFinished` (`src/canvas/renderFinished.ts`) replaces the M1 stub; `exportPng` / `encodeLibraryPng` now take the renderer and are async. With Annotations or a Crop and no renderer they refuse rather than export the bare Capture. Copy, Save as PNG… and the Library PNG's visible pixels all come from it. The auto-copy of a new capture happens in Rust before any Annotation can exist, so it is already the finished image.
- The PNG is encoded by `encodeRgbaPngCompressed` (our own filter + `CompressionStream`), not `canvas.toBlob`: in headless Chromium `toBlob` waited a full second for an idle moment, which would have made Copy and every auto-save feel slow.
- Auto-save: `src/editor/persister.ts`, one serial queue per image shared by the first save, the 1 s debounced auto-save and Discard. An edit during the first save goes into the same file; Discard waits for whatever is writing, then recycles that file, and nothing is written afterwards. Rust `library_update` never creates a file (a late save cannot resurrect a discarded image).
- Platform bridge: new `updateLibraryFile`, `openLatestLibraryImage` (the editor reopens the newest Library PNG on start so edits survive a restart; the Library Strip in ticket 14 supersedes it) and `openSettings`. Rust: `library_update`, `library_open_latest`, `open_settings`. The fake bridge persists its Library in `localStorage` so Playwright can reload.
- Single selection only for now (no rubber-band or Shift multi-select).
- Sticky tool styles are kept in memory per tool (the Style panel edits the tool's style when nothing is selected, and a restyle of a selection updates the tool's style too); persisting them across restarts is ticket 10.

**Verified on Linux:** vitest (222 tests, after merging the integration tip: model, Arrow geometry, edits, async renderer port, shortcut table, view maths, persister races with fake timers, Editor with a stub canvas, bridge packing), Playwright against real Fabric in Chromium (15 new tests in `e2e/annotate.spec.ts`, 33 in all pass: draw, move, resize by end handle, restyle, reload and still editable, Copy and Save as PNG… with the arrow burned in at exact pixels and no `snAP` chunk, Crop in the renderer, keys, 1 s debounce, Discard after drawing, fit/scroll), `tsc`, `vite build`, `rustc --test` on `library.rs` and `png_guard.rs`, `cargo check --target x86_64-pc-windows-gnu` (stub windres), and `rustParity.test.ts`.

**Not verified (Windows only; the new M2 items in `docs/release-checklist.md` cover them):** the three new Tauri commands running for real (atomic replace of a file under OneDrive, `latest_png` on the real Pictures folder, `open_settings`); WebView2 behaviour (Ctrl+wheel and Ctrl+= must not zoom the whole window: handled with `preventDefault`, but only checked in Chromium); pointer feel on the laptop's three monitors and scaled displays (the canvas maps pointer to Capture pixels through Fabric's CSS-scale handling; checked in Chromium at several zoom levels only); the 1 s save timing in the real app. A known gap: an edit made less than a second before the window is closed is flushed on `pagehide` best-effort, and a closing window may not finish the write.
