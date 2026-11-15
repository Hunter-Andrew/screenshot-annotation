//! The `take_capture` wire format, kept free of Tauri so it is testable on any host.
//! `src/platform/tauriBridge.ts` (`unpackCapture`) decodes it.

/// What the automatic clipboard copy of a new Capture did; the editor only reports it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClipboardOutcome {
    // Byte 0 means "not tried"; every delivered Capture is tried, so Rust never sends it.
    Copied = 1,
    Failed = 2,
}

/// u32 LE width, u32 LE height, f64 LE capture time (ms since the Unix epoch), one byte
/// `ClipboardOutcome`, then the PNG. An empty body means nothing is pending.
pub fn pack_capture(width: u32, height: u32, captured_at_ms: f64, clipboard: ClipboardOutcome, png: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(17 + png.len());
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(&captured_at_ms.to_le_bytes());
    out.push(clipboard as u8);
    out.extend_from_slice(png);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn puts_size_time_clipboard_outcome_then_the_png() {
        let packed = pack_capture(3, 2, 1.5, ClipboardOutcome::Copied, b"PNG");
        assert_eq!(&packed[0..4], 3u32.to_le_bytes());
        assert_eq!(&packed[4..8], 2u32.to_le_bytes());
        assert_eq!(&packed[8..16], 1.5f64.to_le_bytes());
        assert_eq!(packed[16], 1);
        assert_eq!(&packed[17..], b"PNG");
    }

    #[test]
    fn outcome_bytes_match_the_frontend() {
        // tauriBridge.ts: [undefined, "copied", "failed"][byte]
        let byte = |o| pack_capture(1, 1, 0.0, o, b"")[16];
        assert_eq!([byte(ClipboardOutcome::Copied), byte(ClipboardOutcome::Failed)], [1, 2]);
        let ts = include_str!("../../src/platform/tauriBridge.ts");
        assert!(ts.contains(r#"[undefined, "copied", "failed"]"#));
    }
}
