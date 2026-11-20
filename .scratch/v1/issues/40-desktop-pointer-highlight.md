# 40: Desktop pointer highlight (tray app, hotkey)

**What to build:** A pointer highlight that works over the whole desktop, not just inside the editor, run by the app in the tray. A hotkey (separate from the capture hotkey, like the Print Screen one: rebindable in Settings) switches it on and off. Its colour is configurable in Settings. Purpose: demos and screen shares.

## Constraints

- A transparent, click-through, non-focusable overlay window that follows the cursor (the same technique as the delay timer's countdown badge, `src-tauri/src/countdown.rs`); clicks must pass through to the apps below.
- The new global hotkey uses the standard `RegisterHotKey` method only (no low-level hooks, no key blocking), per ADRs 0001 and 0007 and ticket 28's constraint.

## Open questions (grill at M6)

- Exact pixel sizes for Small / Medium / Large and the glow opacity.
- Does it hide when the mouse is idle?
- Multi-monitor and mixed-DPI behaviour (one overlay per monitor, as the capture overlay has).
- Hotkey default and where it is set (Settings, next to the capture hotkey); state shown in the tray menu (checked item)?
- Does it persist across restarts (off by default)?

**Blocked by:** nothing (M4 shipped as v0.5.0); M5 (v0.6.0) first.

**Status:** resolved

Spec: `.scratch/snagit-clone/spec.md`. Planned for M6 (v1.0.0, moved from M5 on 2026-11-18); requested by Andrew on 2026-11-17.

## Decisions (grilling, 2026-11-18)

1. **Moved to M6 (v1.0.0)**, together with ticket 41. v1.0.0 is released only when M6 is finished.
2. **Absorbs ticket 39:** the editor's tool column gets a button that toggles this global pointer (not an editor-only pointer).
3. **Look: a red "laser dot"** (superseded by decision 14) (option C in `.scratch/v1/prototypes/m5-pointer-and-palette.html`): a bright red dot with a soft glow. Default colour red, configurable in Settings.
4. **Size:** Small / Medium / Large in Settings (default Medium).
5. **Click ripple:** a brief expanding ring (~400 ms) on click, **on/off in Settings**.
6. The remaining questions are listed under "Open questions (grill at M6)" above.

## Decisions (grilling, 2026-11-19; settles the open questions above)

Build through tickets 49 (hotkeys), 50 (pointer highlight), 51 (editor toggle), 55 (checklist). Shared decisions with ticket 41 are in both files.

1. **Hotkey:** its own global hotkey, default **Ctrl+Shift+L**, rebindable in a new Settings section "Demo tools" (with ticket 41's hotkey). `RegisterHotKey` only. Never Print Screen, never the capture hotkey, never the other demo hotkey; a clash is refused with a message naming the other action.
2. **Always visible while on:** no idle-hide.
3. **Off at every start;** the on/off state is not saved. Only colour, size and ripple persist.
4. **Tray:** a checked item "Pointer highlight" showing the hotkey.
5. **Size (physical pixels at 100% scale, scaled by the monitor's scale factor):** core dot Small 10, Medium 14 (default), Large 20, with the prototype's two-layer glow scaled to match (inner about 70%, outer about 30% opacity); tune on the Windows PC.
6. **Colour:** default red; the 8 annotation colours, custom picker and hex field in Settings. The ripple uses the pointer colour.
7. **Click ripple:** an expanding ring of about 400 ms on **left click only**, on/off in Settings. Clicks are detected by polling the button state in the same loop as the dot; no mouse hook.
8. **Window design:** one small (about 96 px) transparent, click-through, non-focusable, always-on-top window that follows the cursor from monitor to monitor, polled about every 16 ms. When the pointer moves to another monitor, set the position first, then the size, so the size applies at the target monitor's scale (as the capture overlay does). It must look the same size on a 24-inch monitor and a laptop screen (verify on the Windows PC).
9. **Captures:** the dot and ripple are hidden from captures with `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` (Windows 10 2004 and later; the `windows` feature is already enabled).
10. **Full-screen apps:** works over borderless and maximized windows (PowerPoint slideshows, screen-share windows). Exclusive full-screen games are unsupported in v1.0.
11. **Independent of ticket 41's drawing mode:** the dot keeps following the mouse while drawing mode is on.
12. **Editor button (absorbs ticket 39):** a toggle at the bottom of the tool column, not a tool. It shows pressed while the pointer is on and uses the hotkey in its tooltip. While the global pointer is on, **no editor tool is selected (Select included) or usable**, and clicks on the canvas do nothing. Choosing a tool, by click or key, turns the pointer off. Turning the pointer off, by button or hotkey, **selects the Select tool** (it does not restore the previous tool).
14. **Look C, "Hot core + wide haze + thin ring" (chosen by Andrew 2026-11-19 from `.scratch/v1/prototypes/laser-pointer-looks.html`, which stays in the repo as the primary source):** supersedes decision 3 ("laser dot with a soft glow"). The Laser pointer is a wide soft haze (70 x k), one thin ring (36 x k, 1.5 x k border) and a small hot core (8 x k, pale tint of the colour at the centre to the full colour, with a glow), all in the pointer colour and all colour/alpha only; k = core / 14 for Small 10, Medium 14, Large 20, so the size setting keeps its meaning. The haze is held to 90 px (Large would be 100 px) and the ring shrinks in proportion, so everything fits the 96 px window. The click ripple is unchanged. The pale core tint is derived from the chosen colour.

## Decision added 2026-11-19 (Andrew)

13. **The system mouse arrow is hidden while the highlight is on**, because the arrow and the laser dot together looked odd. The dot's look is unchanged (Andrew is choosing a new laser design separately). On Windows every standard system cursor (normal, I-beam, wait, cross, up arrow, the four resize arrows, size all, no, hand, app starting, help; `system_cursor::SYSTEM_CURSOR_IDS`) is replaced with one fully transparent cursor through `SetSystemCursor`, and restored with `SystemParametersInfoW(SPI_SETCURSORS)`, which reloads the user's real cursors from the registry (`SetSystemCursor` never edits the registry, so signing out also restores them). The pointer position is still read with `GetCursorPos`, so the dot is unaffected. **Setting:** `pointerHideCursor` (default true), a checkbox in Settings > Demo tools ("Hide the Windows mouse arrow while the dot is on"), applied live (with the highlight on, unticking restores the arrow at once). **Safeguards:** restore when the highlight goes off; restore on exit (`RunEvent::Exit`, which the tray's Exit reaches) only if this app hid the arrow; restore unconditionally at every app start, in case a previous run was killed (Task Manager, a crash) while the arrow was hidden. The decisions are pure and unit-tested in `src-tauri/src/system_cursor.rs`; the Windows calls are checked by hand in `docs/release-checklist.md` ("Pointer highlight (M6)").

15. **Renamed to Laser pointer (2026-11-19, Andrew):** the feature, its mode and the mark it draws are now called **Laser pointer** (glossary term; "Pointer highlight" is retired). Internal identifiers were renamed too (Rust module `laser_pointer`, window label and route `laser-pointer`, events, commands, bridge methods) and so were the settings keys (`laserPointerColor`, `laserPointerSize`, `laserPointerRipple`, `laserPointerHideCursor`, `laserPointerHotkey`). Old saved values under the old keys are ignored; there are no compatibility aliases.

## Answer

Implemented in M6 on integration branch `claude/pensive-davinci-z10bb6`; reviewed with `code-review` and fixes applied. Awaiting the Windows manual checklist (`docs/release-checklist.md`, "For v1.0.0 (M6)") before any v1.0.0 tag; not released.
