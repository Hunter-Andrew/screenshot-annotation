//! Export safety, defence in depth (ADR 0002, ADR 0004): every Export (Copy, Save as PNG...) must be
//! a plain PNG without the private `snAP` chunk that embeds the unblurred original. The frontend
//! already strips it; this check refuses anything that slipped through. Dependency-free.

/// The private chunk type that carries the editable data (`EMBED_CHUNK` in annotatedImage.ts).
pub const EMBED_CHUNK: &[u8; 4] = b"snAP";

const SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

/// Ok if `bytes` start with the PNG signature and walk as well-formed chunks.
pub fn require_png(bytes: &[u8]) -> Result<(), String> {
    chunk_types(bytes).map(|_| ())
}

/// Ok if `bytes` is a PNG with no `snAP` chunk; otherwise a message saying why the Export is refused.
pub fn require_plain_png(bytes: &[u8]) -> Result<(), String> {
    if chunk_types(bytes)?.iter().any(|t| t == EMBED_CHUNK) {
        return Err("refusing to export: the PNG still carries the private editable-data chunk".into());
    }
    Ok(())
}

fn chunk_types(bytes: &[u8]) -> Result<Vec<[u8; 4]>, String> {
    if bytes.len() < 8 || bytes[..8] != SIGNATURE {
        return Err("refusing to export: the data is not a PNG".into());
    }
    let mut types = Vec::new();
    let mut offset = 8usize;
    while offset + 12 <= bytes.len() {
        let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let end = offset
            .checked_add(12)
            .and_then(|n| n.checked_add(length))
            .filter(|end| *end <= bytes.len())
            .ok_or("refusing to export: the PNG has a truncated chunk")?;
        types.push(bytes[offset + 4..offset + 8].try_into().unwrap());
        offset = end;
    }
    Ok(types)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        // The CRC is not checked here, so zeros do.
        let mut out = (data.len() as u32).to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out.extend_from_slice(data);
        out.extend_from_slice(&[0; 4]);
        out
    }

    fn png(kinds: &[&[u8; 4]]) -> Vec<u8> {
        let mut out = SIGNATURE.to_vec();
        for k in kinds {
            out.extend(chunk(k, b"xyz"));
        }
        out
    }

    #[test]
    fn a_plain_png_passes() {
        let bytes = png(&[b"IHDR", b"IDAT", b"IEND"]);
        assert_eq!(require_png(&bytes), Ok(()));
        assert_eq!(require_plain_png(&bytes), Ok(()));
    }

    #[test]
    fn non_png_bytes_are_refused() {
        for bad in [&b""[..], b"GIF89a-not-a-png", b"\x89PNG"] {
            assert!(require_png(bad).unwrap_err().contains("not a PNG"), "{bad:?}");
            assert!(require_plain_png(bad).unwrap_err().contains("not a PNG"), "{bad:?}");
        }
    }

    #[test]
    fn a_png_carrying_the_private_chunk_is_refused_wherever_it_sits() {
        for kinds in [
            vec![b"IHDR", b"snAP", b"IDAT", b"IEND"],
            vec![b"IHDR", b"IDAT", b"snAP", b"IEND"],
            vec![b"snAP", b"IHDR", b"IDAT", b"IEND"],
        ] {
            let bytes = png(&kinds);
            assert!(require_plain_png(&bytes).unwrap_err().contains("editable-data"));
            // It is still a PNG, which is all a Library save needs.
            assert_eq!(require_png(&bytes), Ok(()));
        }
    }

    #[test]
    fn a_chunk_longer_than_the_data_is_refused_not_panicked_on() {
        let mut bytes = png(&[b"IHDR"]);
        bytes.extend_from_slice(&u32::MAX.to_be_bytes());
        bytes.extend_from_slice(b"snAPxxxx");
        assert!(require_plain_png(&bytes).unwrap_err().contains("truncated"));
        assert!(require_png(&bytes).unwrap_err().contains("truncated"));
    }

    #[test]
    fn the_chunk_name_matches_the_frontend() {
        let ts = include_str!("../../src/core/annotatedImage.ts");
        assert!(ts.contains(&format!("EMBED_CHUNK = \"{}\"", std::str::from_utf8(EMBED_CHUNK).unwrap())));
    }
}
