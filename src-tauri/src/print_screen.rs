//! The Windows "Print Screen opens Snipping Tool" setting, HKCU\Control Panel\Keyboard\
//! PrintScreenKeyForSnippingEnabled. READ-ONLY: this app never writes that value (ticket 10); the
//! user flips the toggle in Windows Settings, which `SETTINGS_URI` opens. No keyboard hooks.

/// Settings > Accessibility > Keyboard. Opened by the dedicated `open_keyboard_accessibility_settings`
/// command so `url_guard` (ADR 0006) stays limited to the Releases page.
pub const SETTINGS_URI: &str = "ms-settings:easeofaccess-keyboard";

/// On unless explicitly 0 (the Windows 11 default when the value is missing).
pub fn snipping_enabled_from(value: Option<u32>) -> bool {
    value != Some(0)
}

/// Interprets the raw registry data: a REG_DWORD (4 bytes, little endian) or a REG_SZ (UTF-16).
/// Anything else is unreadable (`None`, so treated as on).
pub fn value_from_raw(is_dword: bool, bytes: &[u8]) -> Option<u32> {
    if is_dword {
        return Some(u32::from_le_bytes(bytes.get(..4)?.try_into().ok()?));
    }
    let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    String::from_utf16(&units).ok()?.trim_end_matches('\0').trim().parse().ok()
}

/// Whether Print Screen currently belongs to Snipping Tool (see `snipping_enabled_from`).
#[cfg(windows)]
pub fn snipping_enabled() -> bool {
    use windows::core::w;
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, REG_DWORD, REG_VALUE_TYPE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
    };
    let mut buf = [0u8; 64];
    let mut size = buf.len() as u32;
    let mut kind = REG_VALUE_TYPE(0);
    // SAFETY: buf/size/kind are valid for the call; the key and value names are static literals.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Control Panel\\Keyboard"),
            w!("PrintScreenKeyForSnippingEnabled"),
            RRF_RT_REG_DWORD | RRF_RT_REG_SZ,
            Some(&mut kind),
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    let value = if status.is_ok() { value_from_raw(kind == REG_DWORD, &buf[..size as usize]) } else { None };
    snipping_enabled_from(value)
}

/// Non-Windows builds (tests, dev): behave like an untouched Windows 11.
#[cfg(not(windows))]
pub fn snipping_enabled() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_an_explicit_zero_turns_it_off() {
        assert!(!snipping_enabled_from(Some(0)));
        assert!(snipping_enabled_from(Some(1)));
        assert!(snipping_enabled_from(Some(2)));
        assert!(snipping_enabled_from(None));
    }

    #[test]
    fn reads_dword_and_string_registry_data() {
        assert_eq!(value_from_raw(true, &0u32.to_le_bytes()), Some(0));
        assert_eq!(value_from_raw(true, &1u32.to_le_bytes()), Some(1));
        let sz: Vec<u8> = "0\0".encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        assert_eq!(value_from_raw(false, &sz), Some(0));
        assert_eq!(value_from_raw(true, &[1, 0]), None);
        assert_eq!(value_from_raw(false, b"x\0"), None);
    }

    #[test]
    fn the_deep_link_targets_the_accessibility_keyboard_page() {
        assert_eq!(SETTINGS_URI, "ms-settings:easeofaccess-keyboard");
    }
}
