//! Pixel plumbing for a Capture: GDI hands back BGRA rows with undefined alpha; the app wants an
//! opaque RGBA PNG. Platform-independent so the tests run anywhere.

/// Turn BGRA bytes (alpha ignored) into opaque RGBA, in place.
pub fn bgra_to_opaque_rgba(pixels: &mut [u8]) {
    for px in pixels.chunks_exact_mut(4) {
        px.swap(0, 2);
        px[3] = 255;
    }
}

/// Encode 8-bit RGBA pixels as a PNG.
pub fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    if rgba.len() != (width as usize) * (height as usize) * 4 {
        return Err("pixel buffer does not match the image size".into());
    }
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    // Capture speed matters more than size (release to editor < 300 ms).
    encoder.set_compression(png::Compression::Fast);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(rgba).map_err(|e| e.to_string())?;
    writer.finish().map_err(|e| e.to_string())?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bgra_becomes_opaque_rgba() {
        let mut px = [10, 20, 30, 0, 1, 2, 3, 77];
        bgra_to_opaque_rgba(&mut px);
        assert_eq!(px, [30, 20, 10, 255, 3, 2, 1, 255]);
    }

    #[test]
    fn png_round_trips_the_exact_pixels_and_size() {
        let rgba: Vec<u8> = (0..3 * 2 * 4).map(|i| (i * 7) as u8).collect();
        let bytes = encode_png(3, 2, &rgba).unwrap();

        let mut reader = png::Decoder::new(std::io::Cursor::new(bytes)).read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut buf).unwrap();

        assert_eq!((info.width, info.height), (3, 2));
        assert_eq!(info.color_type, png::ColorType::Rgba);
        assert_eq!(&buf[..info.buffer_size()], &rgba[..]);
    }

    #[test]
    fn a_wrong_sized_buffer_is_an_error() {
        assert!(encode_png(2, 2, &[0; 4]).is_err());
    }
}
