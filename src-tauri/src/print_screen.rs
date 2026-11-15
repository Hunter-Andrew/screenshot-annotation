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

/// One look at the registry value: what was read (`None`: missing or unreadable) and how, for the log.
#[derive(Debug, Clone, PartialEq)]
pub struct Reading {
    pub value: Option<u32>,
    pub note: String,
}

impl Reading {
    /// Whether Print Screen currently belongs to Snipping Tool (see `snipping_enabled_from`).
    pub fn enabled(&self) -> bool {
        snipping_enabled_from(self.value)
    }

    /// One log line: the raw value, how it was read, and what it means.
    pub fn describe(&self) -> String {
        let value = self.value.map_or_else(|| "<unset>".to_string(), |v| v.to_string());
        let meaning = if self.enabled() {
            "Snipping Tool keeps Print Screen"
        } else {
            "Print Screen is free for other apps"
        };
        format!(
            "PrintScreenKeyForSnippingEnabled={value} ({}): snipping_enabled={}, {meaning}",
            self.note,
            self.enabled()
        )
    }
}

/// Reads the registry value now (never cached; the user flips it while the app runs).
#[cfg(windows)]
pub fn read() -> Reading {
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
    if !status.is_ok() {
        return Reading { value: None, note: format!("not read, status {}", status.0) };
    }
    let is_dword = kind == REG_DWORD;
    let value = value_from_raw(is_dword, &buf[..(size as usize).min(buf.len())]);
    let note = format!("{}{}", if is_dword { "REG_DWORD" } else { "REG_SZ" }, if value.is_none() { ", unparseable" } else { "" });
    Reading { value, note }
}

/// Non-Windows builds (tests, dev): behave like an untouched Windows 11.
#[cfg(not(windows))]
pub fn read() -> Reading {
    Reading { value: None, note: "not Windows".into() }
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

    #[test]
    fn a_reading_describes_itself_for_the_log() {
        let on = Reading { value: Some(1), note: "REG_DWORD".into() };
        assert_eq!(
            on.describe(),
            "PrintScreenKeyForSnippingEnabled=1 (REG_DWORD): snipping_enabled=true, Snipping Tool keeps Print Screen"
        );
        let off = Reading { value: Some(0), note: "REG_SZ".into() };
        assert_eq!(
            off.describe(),
            "PrintScreenKeyForSnippingEnabled=0 (REG_SZ): snipping_enabled=false, Print Screen is free for other apps"
        );
        let missing = Reading { value: None, note: "value not found (status 2)".into() };
        assert_eq!(
            missing.describe(),
            "PrintScreenKeyForSnippingEnabled=<unset> (value not found (status 2)): snipping_enabled=true, Snipping Tool keeps Print Screen"
        );
        assert!(missing.enabled() && on.enabled() && !off.enabled());
    }
}
