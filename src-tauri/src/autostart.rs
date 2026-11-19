//! Launch at sign-in (ticket 23): the per-user Run key,
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, which needs no admin rights and is what
//! Windows' own Settings > Apps > Startup list shows (and lets the user switch off there too).
//!
//! The rule lives here and is tested against a fake key on any OS (`cargo test`); `HkcuRun` is the
//! Windows registry behind it and is exercised by hand (docs/release-checklist.md).

use std::path::Path;

/// The registry key under HKCU that Windows reads at sign-in.
pub const RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
/// The value name this app uses inside it.
pub const VALUE_NAME: &str = "Sigil (Screenshot Annotation)";

/// The command line stored in the Run value: the exe path in quotes (a path with spaces needs them),
/// no arguments, so a sign-in launch starts in the tray like any other launch.
pub fn run_command(exe: &Path) -> String {
    format!("\"{}\"", exe.display())
}

/// The one value this app owns inside the Run key.
pub trait RunKey {
    /// The stored command, or `None` when the value does not exist.
    fn read(&self) -> Result<Option<String>, String>;
    fn write(&self, command: &str) -> Result<(), String>;
    /// Deleting a value that does not exist is not an error.
    fn remove(&self) -> Result<(), String>;
}

/// What `apply` did to the Run value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Added,
    /// It existed with another command (the app moved, e.g. a reinstall elsewhere) and was corrected.
    Updated,
    Removed,
    /// Already as wanted; the registry was not written.
    Unchanged,
}

/// Make the Run value match `enabled`: present and pointing at `exe`, or absent. Run at every start
/// as well as on every change in Settings, so a moved install heals itself and a value the user
/// removed in Windows' Startup list is honored by the Settings checkbox reading the same truth.
pub fn apply(key: &dyn RunKey, enabled: bool, exe: &Path) -> Result<Change, String> {
    let stored = key.read()?;
    if !enabled {
        return match stored {
            Some(_) => key.remove().map(|()| Change::Removed),
            None => Ok(Change::Unchanged),
        };
    }
    let wanted = run_command(exe);
    match stored {
        Some(current) if current.eq_ignore_ascii_case(&wanted) => Ok(Change::Unchanged),
        Some(_) => key.write(&wanted).map(|()| Change::Updated),
        None => key.write(&wanted).map(|()| Change::Added),
    }
}

/// The real Run key of the current user.
#[cfg(windows)]
pub struct HkcuRun;

#[cfg(windows)]
impl RunKey for HkcuRun {
    fn read(&self) -> Result<Option<String>, String> {
        use windows::core::HSTRING;
        use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
        use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
        let (path, name) = (HSTRING::from(RUN_KEY_PATH), HSTRING::from(VALUE_NAME));
        // First ask how many bytes the value needs, then read it.
        let mut size = 0u32;
        // SAFETY: `size` is valid for the call; the names are live HSTRINGs.
        let status = unsafe { RegGetValueW(HKEY_CURRENT_USER, &path, &name, RRF_RT_REG_SZ, None, None, Some(&mut size)) };
        if status == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if status != ERROR_SUCCESS {
            return Err(format!("could not read the Run value (status {})", status.0));
        }
        let mut buf = vec![0u16; (size as usize).div_ceil(2) + 1];
        let mut size = (buf.len() * 2) as u32;
        // SAFETY: `buf` holds `size` bytes and outlives the call.
        let status = unsafe {
            RegGetValueW(HKEY_CURRENT_USER, &path, &name, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut size))
        };
        if status != ERROR_SUCCESS {
            return Err(format!("could not read the Run value (status {})", status.0));
        }
        let units = (size as usize / 2).min(buf.len());
        Ok(Some(String::from_utf16_lossy(&buf[..units]).trim_end_matches('\0').to_string()))
    }

    fn write(&self, command: &str) -> Result<(), String> {
        use windows::core::HSTRING;
        use windows::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
        let (path, name) = (HSTRING::from(RUN_KEY_PATH), HSTRING::from(VALUE_NAME));
        let data: Vec<u16> = command.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: `data` holds `data.len() * 2` bytes and outlives the call.
        let status = unsafe {
            RegSetKeyValueW(HKEY_CURRENT_USER, &path, &name, REG_SZ.0, Some(data.as_ptr().cast()), (data.len() * 2) as u32)
        };
        if status.is_ok() { Ok(()) } else { Err(format!("could not write the Run value (status {})", status.0)) }
    }

    fn remove(&self) -> Result<(), String> {
        use windows::core::HSTRING;
        use windows::Win32::Foundation::ERROR_FILE_NOT_FOUND;
        use windows::Win32::System::Registry::{RegDeleteKeyValueW, HKEY_CURRENT_USER};
        let (path, name) = (HSTRING::from(RUN_KEY_PATH), HSTRING::from(VALUE_NAME));
        // SAFETY: the names are live HSTRINGs.
        let status = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, &path, &name) };
        if status.is_ok() || status == ERROR_FILE_NOT_FOUND {
            Ok(())
        } else {
            Err(format!("could not delete the Run value (status {})", status.0))
        }
    }
}

/// On a platform without the registry the setting has nowhere to live; it only keeps its value.
#[cfg(not(windows))]
pub struct HkcuRun;

#[cfg(not(windows))]
impl RunKey for HkcuRun {
    fn read(&self) -> Result<Option<String>, String> {
        Ok(None)
    }
    fn write(&self, _command: &str) -> Result<(), String> {
        Ok(())
    }
    fn remove(&self) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::path::PathBuf;

    #[derive(Default)]
    struct FakeKey {
        value: RefCell<Option<String>>,
        writes: RefCell<u32>,
        removes: RefCell<u32>,
        fail: bool,
    }

    impl RunKey for FakeKey {
        fn read(&self) -> Result<Option<String>, String> {
            if self.fail { Err("registry unavailable".into()) } else { Ok(self.value.borrow().clone()) }
        }
        fn write(&self, command: &str) -> Result<(), String> {
            if self.fail { return Err("registry unavailable".into()); }
            *self.writes.borrow_mut() += 1;
            *self.value.borrow_mut() = Some(command.to_string());
            Ok(())
        }
        fn remove(&self) -> Result<(), String> {
            if self.fail { return Err("registry unavailable".into()); }
            *self.removes.borrow_mut() += 1;
            *self.value.borrow_mut() = None;
            Ok(())
        }
    }

    fn exe() -> PathBuf {
        PathBuf::from(r"C:\Users\Andrew\AppData\Local\Sigil (Screenshot Annotation)\screenshot-annotation.exe")
    }

    #[test]
    fn the_command_is_the_quoted_exe_path_with_no_arguments() {
        assert_eq!(
            run_command(&exe()),
            r#""C:\Users\Andrew\AppData\Local\Sigil (Screenshot Annotation)\screenshot-annotation.exe""#
        );
    }

    #[test]
    fn turning_it_on_adds_the_value() {
        let key = FakeKey::default();
        assert_eq!(apply(&key, true, &exe()), Ok(Change::Added));
        assert_eq!(key.value.borrow().as_deref(), Some(run_command(&exe()).as_str()));
    }

    #[test]
    fn turning_it_on_again_does_not_write_the_registry() {
        let key = FakeKey::default();
        apply(&key, true, &exe()).unwrap();
        assert_eq!(apply(&key, true, &exe()), Ok(Change::Unchanged));
        assert_eq!(*key.writes.borrow(), 1);
    }

    #[test]
    fn a_value_pointing_at_an_old_location_is_corrected() {
        let key = FakeKey::default();
        *key.value.borrow_mut() = Some(r#""D:\old\screenshot-annotation.exe""#.into());
        assert_eq!(apply(&key, true, &exe()), Ok(Change::Updated));
        assert_eq!(key.value.borrow().as_deref(), Some(run_command(&exe()).as_str()));
    }

    #[test]
    fn the_same_path_in_another_letter_case_counts_as_unchanged() {
        let key = FakeKey::default();
        *key.value.borrow_mut() = Some(run_command(&exe()).to_uppercase());
        assert_eq!(apply(&key, true, &exe()), Ok(Change::Unchanged));
    }

    #[test]
    fn turning_it_off_removes_the_value() {
        let key = FakeKey::default();
        apply(&key, true, &exe()).unwrap();
        assert_eq!(apply(&key, false, &exe()), Ok(Change::Removed));
        assert_eq!(*key.value.borrow(), None);
    }

    #[test]
    fn turning_it_off_when_there_is_nothing_to_remove_does_nothing() {
        let key = FakeKey::default();
        assert_eq!(apply(&key, false, &exe()), Ok(Change::Unchanged));
        assert_eq!(*key.removes.borrow(), 0);
    }

    #[test]
    fn a_registry_failure_is_reported_not_hidden() {
        let key = FakeKey { fail: true, ..FakeKey::default() };
        assert_eq!(apply(&key, true, &exe()), Err("registry unavailable".to_string()));
        assert_eq!(apply(&key, false, &exe()), Err("registry unavailable".to_string()));
    }
}
