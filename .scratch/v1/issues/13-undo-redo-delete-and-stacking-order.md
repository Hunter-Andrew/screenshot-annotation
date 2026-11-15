# 13: Undo/redo, delete and stacking order

**What to build:** Every editor change can be undone and redone, including after switching images or restarting. History is stored per image in local app data (never in the PNG), capped at 200 steps, discarded if the PNG's content hash changed outside the app, and deleted after 60 days without opening or editing. Delete removes the selected Annotation, and bring forward / send back reorder Annotations.

**Blocked by:** 09 (Side-panel editor and Arrow tool)

**Status:** resolved

- [x] Unit tests for the cap, the hash discard and expiry
- [x] E2E: undo/redo survives a reload
- [x] Delete and reorder work

Spec: `.scratch/snagit-clone/spec.md`.

## Comments

2026-11-15 (Claude, implementation):

**How it works.**
- `src/core/history.ts` (pure): a step is `{ undo: Edit, redo: Edit, at }`. `invert(before, edit)` derives the inverse generically from the image before the edit (an update inverts to the old values of the keys it patched), so a new Annotation kind in tickets 10-12, 18-20 needs nothing here. A new kind of `Edit` (ticket 21's `setCrop`) adds one case to `invert` and one to `applyEdit`. 200-step cap; a burst of same-key updates to one Annotation within 500 ms is one step (a drag, a slider); a new edit clears Redo.
- `src/core/editSession.ts`: `Edit` gained `delete`, `reorder` (`to` = back-to-front index, clamped) and an optional `index` on `add` (how undoing a delete restores the old place). `EditSession` gained `undo()`, `redo()`, `canUndo`, `canRedo`, `history`, and options `{ history, now }` (injectable clock). `apply` records the step; undo/redo replay through `applyEdit` and notify subscribers, so the canvas redraws through `canvas.sync(model)` and auto-save runs as for any edit. A stale step that changes nothing is dropped instead of blocking Undo.
- `src/core/historyFile.ts` (pure): versioned file (`version: 1`), `restoreHistory(text, currentHash, now)` returns the history or an empty one with the reason (`none`, `restored`, `corrupt`, `changed` for a hash mismatch, `expired` after 60 days), never throws; corrupt, newer-version or malformed files are discarded, not fatal. `expiryCutoff(now)` is what the platform purges by. `src/core/hash.ts`: SHA-256 hex.
- `src/editor/historyStore.ts`: wires those rules to four new bridge calls (`readHistory`, `writeHistory`, `deleteHistory`, `purgeHistoryBefore`), keyed by the SHA-256 of the lower-cased Library path, on one serial queue. A history is stored against the hash of the exact PNG bytes the app wrote (`persister` got an `onSaved` hook that hands over the bytes and the history as of the moment they were encoded, not awaited, so the next save never waits for it). Opening an image restores its history and counts as use (rewrites the file, restarting the 60 days); the app also purges on start; Discard deletes the history.
- Rust: `src-tauri/src/history_store.rs` (pure std, `rustc --test`: key check, atomic write, delete, purge by file age) and four commands in `lib.rs` (`history_read/write/delete/purge_before`) storing in `app_local_data_dir()/history/<key>.json`. Never inside the PNG. `show_settings` is still above `show_editor`.
- UI: Undo and Redo buttons in the top bar; an Arrange section in the Style panel (Bring forward, Send back, Delete) shown while an Annotation is selected. Shortcuts from the one table in `src/editor/shortcuts.ts`: `editor.undo` Ctrl+Z, `editor.redo` Ctrl+Y, `editor.redoAlt` Ctrl+Shift+Z (listed before undo on purpose: a binding that does not spell out Shift also matches with Shift held), `editor.delete` Delete and `editor.deleteBackspace` Backspace (both `fixed: true`, so ticket 28 must not offer them for remapping), `editor.bringForward` Ctrl+], `editor.sendBack` Ctrl+[. Keys typed into a text field are ignored by the existing `isTypingTarget` check, so Ctrl+Z, Delete and Backspace in the thickness box (and the Text tool's editor, ticket 11) stay with the field.

**For tickets 10, 11, 12 (and later).**
- Call `session.apply(...)` and you get undo/redo, persistence and expiry for free. Do not mutate the model any other way, and do not put a derived or transient value in an `update` patch that is not part of the model.
- An `update` patch must hold whole top-level keys (the existing rule); the inverse restores exactly those keys.
- A tool that streams many updates during one gesture (Pen drawing points) should apply one `add` at the end, not an `update` per point, or the burst-merge (500 ms) is all that keeps it from filling the 200-step cap.
- The Text tool's in-place editor must be a text input, textarea or `contentEditable` so `isTypingTarget` sees it; otherwise Delete and Ctrl+Z go to the canvas while the user types.
- The Style panel's new Arrange section is a prop (`arrange`) on `StylePanel`; the group editors are untouched.
- Ticket 14 (Library Strip): to open another image call `historyStore.open(path, pngBytes)` with the bytes just read and pass the result as `createEditSession(decoded, { history })`; on delete call `historyStore.remove(path)`. Ticket 17 (folder is the source of truth) should delete history for files that vanish; renaming or moving a file in Explorer loses its history because the key is the path (the hash check would not have saved it either).
- Ticket 21 (Crop): add `setCrop` to `Edit`, `applyEdit` and `invert`, and extend `isEdit` in `src/core/historyFile.ts` (it rejects unknown edit kinds, which would discard a stored history).

**Verified on Linux:** vitest (unit tests for the cap, the hash discard, the 60-day expiry with an injected clock, corrupt and wrong-version files, inverse of every edit kind, session undo/redo, persister `onSaved`, the history store against the fake bridge, the shortcut table, Editor behaviour with the stub canvas: buttons, keys, restart, changed-PNG discard, per-image history, Discard, typing in a field, Delete, Backspace, reorder), Playwright against real Fabric in Chromium (`e2e/history.spec.ts`: undo/redo survive a reload twice over, hash change drops the history, Delete/Backspace and undo, bring forward / send back by button and keys with the saved PNG showing the new order, typing in the thickness box), `tsc`, `vite build`, `rustc --test` on `history_store.rs`, `library.rs` and `png_guard.rs`, `cargo check --target x86_64-pc-windows-gnu` (stub windres), `rustParity.test.ts`.

**Not verified (Windows only; the new M2 items in `docs/release-checklist.md` cover them):** the four history commands running for real (the `app_local_data_dir` path on the laptop, atomic replace, mtime-based purge on NTFS); that a restart of the real app restores the history; the 60-day purge against real file dates; behaviour under OneDrive (the history folder is under `%LOCALAPPDATA%`, which OneDrive does not sync). The "upgrade keeps undo history" M2 checklist item is also still to be run by hand. A known gap: an edit made less than a second before the window closes is flushed on `pagehide` best-effort, and its history file may not finish writing; the next open then sees a hash mismatch and starts with no history (the picture itself is never affected).
