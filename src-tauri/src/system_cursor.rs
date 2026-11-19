//! Hiding the Windows mouse arrow while the pointer highlight is on (ticket 40 decision 13), so only the laser dot
//! shows. Two parts, kept apart on purpose:
//!
//! - The decisions (which system cursors, when to hide, when to restore, "restore only if we hid it", restore at
//!   startup and at exit) are plain functions and a small state machine with no Windows calls and no other crate
//!   modules, so they are unit-tested on any machine (`rustc --test src/system_cursor.rs` runs them).
//! - The Windows calls are in `platform`, with an empty stand-in on other systems (as `exclude_from_capture` in
//!   `pointer_highlight.rs` has). They cannot be run on the Linux dev box: docs/release-checklist.md has the
//!   steps to check them by hand.
//!
//! How it works: `SetSystemCursor` swaps each standard system cursor for a fully transparent one in this Windows
//! session (it does not touch the registry); `SystemParametersInfoW(SPI_SETCURSORS)` reloads the user's real
//! cursors from the registry. So even if the app is killed while the arrow is hidden, signing out or the next start
//! of the app (which restores first thing) brings the arrow back.

/// The standard system cursors that are replaced while hidden, as the `OCR_*` ids `SetSystemCursor` takes: normal,
/// I-beam, wait, cross, up arrow, the four resize arrows (NWSE, NESW, WE, NS), size all, no, hand, app starting, help.
#[cfg_attr(not(windows), allow(dead_code))]
pub const SYSTEM_CURSOR_IDS: [u32; 14] = [
    32512, // OCR_NORMAL
    32513, // OCR_IBEAM
    32514, // OCR_WAIT
    32515, // OCR_CROSS
    32516, // OCR_UP
    32642, // OCR_SIZENWSE
    32643, // OCR_SIZENESW
    32644, // OCR_SIZEWE
    32645, // OCR_SIZENS
    32646, // OCR_SIZEALL
    32648, // OCR_NO
    32649, // OCR_HAND
    32650, // OCR_APPSTARTING
    32651, // OCR_HELP
];

/// What to do to the system cursors now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Replace the standard cursors with a transparent one.
    Hide,
    /// Reload the user's real cursors.
    Restore,
    /// Already as wanted.
    Nothing,
}

/// What the app does at start, whatever happened last time: restore. An earlier run that was killed (Task Manager, a
/// crash) may have left the arrow hidden, and this app cannot know, so it asks Windows to reload the real cursors.
pub fn on_startup() -> Action {
    Action::Restore
}

/// Whether the arrow should be hidden: only while the pointer highlight is on and the setting allows it.
pub fn wanted_hidden(highlight_on: bool, hide_setting: bool) -> bool {
    highlight_on && hide_setting
}

/// Remembers whether this app has hidden the arrow, so it restores only what it hid.
#[derive(Debug, Default)]
pub struct Hider {
    hidden: bool,
}

impl Hider {
    /// Bring the arrow in line with the highlight (`highlight_on`) and the setting; the answer is what to do about it.
    /// The state is updated as if the action will be done: a hide that half failed is still restored later.
    pub fn sync(&mut self, highlight_on: bool, hide_setting: bool) -> Action {
        let want = wanted_hidden(highlight_on, hide_setting);
        match (want, self.hidden) {
            (true, false) => {
                self.hidden = true;
                Action::Hide
            }
            (false, true) => {
                self.hidden = false;
                Action::Restore
            }
            _ => Action::Nothing,
        }
    }

    /// The app is exiting: restore, but only if this app hid the arrow.
    pub fn on_exit(&mut self) -> Action {
        if self.hidden {
            self.hidden = false;
            Action::Restore
        } else {
            Action::Nothing
        }
    }
}

/// Hide the system arrow and the other standard cursors (Windows only).
pub fn hide() -> Result<(), String> {
    platform::hide()
}

/// Reload the user's real cursors from the registry (Windows only).
pub fn restore() -> Result<(), String> {
    platform::restore()
}

#[cfg(windows)]
mod platform {
    use super::SYSTEM_CURSOR_IDS;
    use windows::Win32::UI::WindowsAndMessaging::{
        CopyIcon, CreateCursor, DestroyCursor, SetSystemCursor, SystemParametersInfoW, HCURSOR, HICON, SPIF_SENDCHANGE,
        SPI_SETCURSORS, SYSTEM_CURSOR_ID,
    };

    /// A cursor is 32 x 32 pixels, one bit each: 32 rows of 4 bytes.
    const PLANE_BYTES: usize = 32 * 32 / 8;

    pub fn hide() -> Result<(), String> {
        // AND mask all ones and XOR mask all zeros: every pixel keeps what is behind it, so the cursor is invisible.
        let and_plane = [0xFFu8; PLANE_BYTES];
        let xor_plane = [0u8; PLANE_BYTES];
        // SAFETY: both planes are 32 x 32 one-bit-per-pixel bitmaps ({PLANE_BYTES} bytes) that live until the end of
        // this function; CreateCursor copies them.
        let transparent = unsafe { CreateCursor(None, 0, 0, 32, 32, and_plane.as_ptr().cast(), xor_plane.as_ptr().cast()) }
            .map_err(|e| format!("CreateCursor failed: {e}"))?;
        let mut failed = 0;
        for id in SYSTEM_CURSOR_IDS {
            // SetSystemCursor takes over the cursor it is given (and destroys the one it replaces), so every id gets
            // its own copy. A cursor and an icon are the same kind of handle; CopyIcon is what the CopyCursor macro is.
            // SAFETY: `transparent` is a live cursor handle owned here; the copy is handed over to Windows on success.
            match unsafe { CopyIcon(HICON(transparent.0)) } {
                Ok(copy) => {
                    // SAFETY: `copy` is a live cursor handle we own; Windows owns it after a successful call.
                    if unsafe { SetSystemCursor(HCURSOR(copy.0), SYSTEM_CURSOR_ID(id)) }.is_err() {
                        failed += 1;
                        // SAFETY: Windows did not take `copy`, so it is still ours to destroy.
                        let _ = unsafe { DestroyCursor(HCURSOR(copy.0)) };
                    }
                }
                Err(_) => failed += 1,
            }
        }
        // SAFETY: `transparent` was made above and is not used again.
        let _ = unsafe { DestroyCursor(transparent) };
        if failed == 0 {
            Ok(())
        } else {
            Err(format!("{failed} of {} system cursors could not be replaced", SYSTEM_CURSOR_IDS.len()))
        }
    }

    pub fn restore() -> Result<(), String> {
        // SAFETY: SPI_SETCURSORS takes no parameter (uiParam 0, pvParam NULL); it reloads the cursors from the registry.
        unsafe { SystemParametersInfoW(SPI_SETCURSORS, 0, None, SPIF_SENDCHANGE) }.map_err(|e| format!("SPI_SETCURSORS failed: {e}"))
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn hide() -> Result<(), String> {
        Ok(())
    }

    pub fn restore() -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_fourteen_standard_cursors_are_replaced_once_each() {
        let mut ids = SYSTEM_CURSOR_IDS.to_vec();
        assert_eq!(ids.len(), 14);
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 14);
        // The OCR_* ids from winuser.h, written out independently of the table.
        for id in [32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650, 32651] {
            assert!(SYSTEM_CURSOR_IDS.contains(&id), "{id}");
        }
    }

    #[test]
    fn the_arrow_is_hidden_only_while_the_highlight_is_on_and_the_setting_allows_it() {
        assert!(wanted_hidden(true, true));
        assert!(!wanted_hidden(true, false));
        assert!(!wanted_hidden(false, true));
        assert!(!wanted_hidden(false, false));
    }

    #[test]
    fn switching_the_highlight_on_hides_and_off_restores() {
        let mut h = Hider::default();
        assert_eq!(h.sync(true, true), Action::Hide);
        assert_eq!(h.sync(true, true), Action::Nothing);
        assert_eq!(h.sync(false, true), Action::Restore);
        assert_eq!(h.sync(false, true), Action::Nothing);
    }

    #[test]
    fn nothing_is_hidden_or_restored_when_the_setting_is_off() {
        let mut h = Hider::default();
        assert_eq!(h.sync(true, false), Action::Nothing);
        assert_eq!(h.sync(false, false), Action::Nothing);
    }

    #[test]
    fn turning_the_setting_off_or_on_while_the_highlight_is_on_acts_at_once() {
        let mut h = Hider::default();
        assert_eq!(h.sync(true, true), Action::Hide);
        assert_eq!(h.sync(true, false), Action::Restore);
        assert_eq!(h.sync(true, true), Action::Hide);
    }

    #[test]
    fn the_setting_changing_while_the_highlight_is_off_does_nothing() {
        let mut h = Hider::default();
        assert_eq!(h.sync(false, true), Action::Nothing);
        assert_eq!(h.sync(false, false), Action::Nothing);
        assert_eq!(h.sync(false, true), Action::Nothing);
    }

    #[test]
    fn exiting_restores_only_what_this_app_hid() {
        let mut never = Hider::default();
        assert_eq!(never.on_exit(), Action::Nothing);

        let mut hid = Hider::default();
        hid.sync(true, true);
        assert_eq!(hid.on_exit(), Action::Restore);
        assert_eq!(hid.on_exit(), Action::Nothing);

        let mut restored_already = Hider::default();
        restored_already.sync(true, true);
        restored_already.sync(false, true);
        assert_eq!(restored_already.on_exit(), Action::Nothing);
    }

    #[test]
    fn starting_always_restores_in_case_an_earlier_run_was_killed_with_the_arrow_hidden() {
        assert_eq!(on_startup(), Action::Restore);
    }

    #[test]
    fn a_hide_after_an_exit_restore_hides_again() {
        let mut h = Hider::default();
        h.sync(true, true);
        h.on_exit();
        assert_eq!(h.sync(true, true), Action::Hide);
    }
}
