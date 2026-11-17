//! Thumbnails for the Library Strip and grid (M3, ticket 14). A thumbnail is a small PNG of an
//! Annotated Image's visible pixels (the finished image), cached under `%LOCALAPPDATA%` by
//! `library_index::thumbnail_name`. The cache is disposable: deleting it only makes the next look slower.

use std::io::Cursor;

/// Longest edge of a thumbnail in pixels: twice the 230 px grid cards, so they stay sharp on a
/// high-DPI screen, and the strip uses the same file.
pub const THUMB_EDGE: u32 = 460;

/// Size of a thumbnail for a `width` x `height` image: the longest edge becomes `edge`; images already
/// that small are not enlarged.
pub fn target_size(width: u32, height: u32, edge: u32) -> (u32, u32) {
    let longest = width.max(height);
    if longest <= edge {
        return (width, height);
    }
    let scale = |n: u32| ((u64::from(n) * u64::from(edge) + u64::from(longest) / 2) / u64::from(longest)).max(1) as u32;
    (scale(width), scale(height))
}

/// Shrink straight RGBA8 pixels by averaging the source pixels each destination pixel covers (a box
/// filter), with colour weighted by alpha so transparent pixels do not darken the edges.
pub fn downscale_rgba(src: &[u8], sw: u32, sh: u32, dw: u32, dh: u32) -> Vec<u8> {
    assert_eq!(src.len(), sw as usize * sh as usize * 4, "source size does not match its dimensions");
    let (sw, sh, dw, dh) = (sw as usize, sh as usize, dw as usize, dh as usize);
    let mut out = vec![0u8; dw * dh * 4];
    for dy in 0..dh {
        let y0 = dy * sh / dh;
        let y1 = ((dy + 1) * sh / dh).max(y0 + 1).min(sh);
        for dx in 0..dw {
            let x0 = dx * sw / dw;
            let x1 = ((dx + 1) * sw / dw).max(x0 + 1).min(sw);
            let (mut r, mut g, mut b, mut a, mut n) = (0u64, 0u64, 0u64, 0u64, 0u64);
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = (y * sw + x) * 4;
                    let alpha = u64::from(src[i + 3]);
                    r += u64::from(src[i]) * alpha;
                    g += u64::from(src[i + 1]) * alpha;
                    b += u64::from(src[i + 2]) * alpha;
                    a += alpha;
                    n += 1;
                }
            }
            let o = (dy * dw + dx) * 4;
            if a > 0 {
                out[o] = ((r + a / 2) / a) as u8;
                out[o + 1] = ((g + a / 2) / a) as u8;
                out[o + 2] = ((b + a / 2) / a) as u8;
            }
            out[o + 3] = ((a + n / 2) / n) as u8;
        }
    }
    out
}

/// A thumbnail PNG for the PNG in `png_bytes` (a Library file or a plain PNG), longest edge `edge`.
pub fn make_thumbnail(png_bytes: &[u8], edge: u32) -> Result<Vec<u8>, String> {
    let mut decoder = png::Decoder::new(Cursor::new(png_bytes));
    // Palettes and low bit depths become plain 8-bit channels; 16-bit is reduced to 8.
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let size = reader.output_buffer_size().ok_or("the image is too large to read")?;
    let mut buf = vec![0u8; size];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    let (width, height) = (info.width, info.height);
    if width == 0 || height == 0 {
        return Err("the image is empty".into());
    }
    let pixels = &buf[..info.buffer_size()];
    let rgba: Vec<u8> = match info.color_type {
        png::ColorType::Rgba => pixels.to_vec(),
        png::ColorType::Rgb => pixels.chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => pixels.chunks_exact(2).flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
        png::ColorType::Grayscale => pixels.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        png::ColorType::Indexed => return Err("an unexpanded palette".into()),
    };
    let (dw, dh) = target_size(width, height, edge);
    let small = if (dw, dh) == (width, height) { rgba } else { downscale_rgba(&rgba, width, height, dw, dh) };
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, dw, dh);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&small).map_err(|e| e.to_string())?;
    writer.finish().map_err(|e| e.to_string())?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode(width: u32, height: u32, color: png::ColorType, data: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(color);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(data).unwrap();
        writer.finish().unwrap();
        out
    }

    fn decode(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
        let mut reader = png::Decoder::new(Cursor::new(bytes)).read_info().unwrap();
        let mut buf = vec![0u8; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut buf).unwrap();
        (info.width, info.height, buf[..info.buffer_size()].to_vec())
    }

    #[test]
    fn the_longest_edge_becomes_the_thumbnail_edge_and_small_images_stay_small() {
        assert_eq!(target_size(1920, 1080, 460), (460, 259));
        assert_eq!(target_size(1080, 1920, 460), (259, 460));
        assert_eq!(target_size(460, 100, 460), (460, 100));
        assert_eq!(target_size(200, 100, 460), (200, 100));
        assert_eq!(target_size(5000, 3, 460), (460, 1), "never collapses to nothing");
    }

    #[test]
    fn downscaling_averages_the_pixels_each_one_covers() {
        // 2x2: black, white / white, black -> one grey pixel.
        let src = [0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255];
        assert_eq!(downscale_rgba(&src, 2, 2, 1, 1), vec![128, 128, 128, 255]);
        // A solid colour stays that colour at any size.
        let solid: Vec<u8> = std::iter::repeat([10, 20, 30, 255]).take(9 * 7).flatten().collect();
        let small = downscale_rgba(&solid, 9, 7, 4, 3);
        assert!(small.chunks_exact(4).all(|p| p == [10, 20, 30, 255]));
    }

    #[test]
    fn transparent_pixels_do_not_darken_their_neighbours() {
        // One opaque red and one fully transparent (black) pixel: the result is half-transparent RED, not dark red.
        let src = [255, 0, 0, 255, 0, 0, 0, 0];
        assert_eq!(downscale_rgba(&src, 2, 1, 1, 1), vec![255, 0, 0, 128]);
    }

    #[test]
    fn a_big_png_becomes_a_small_png_with_the_same_picture() {
        let (w, h) = (1000u32, 500u32);
        let mut data = Vec::new();
        for y in 0..h {
            for x in 0..w {
                data.extend_from_slice(&if x < w / 2 { [255, 0, 0, 255] } else if y < h / 2 { [0, 255, 0, 255] } else { [0, 0, 255, 255] });
            }
        }
        let thumb = make_thumbnail(&encode(w, h, png::ColorType::Rgba, &data), 100).unwrap();
        let (tw, th, pixels) = decode(&thumb);
        assert_eq!((tw, th), (100, 50));
        let at = |x: usize, y: usize| pixels[(y * 100 + x) * 4..][..4].to_vec();
        assert_eq!(at(10, 25), [255, 0, 0, 255]);
        assert_eq!(at(90, 5), [0, 255, 0, 255]);
        assert_eq!(at(90, 45), [0, 0, 255, 255]);
    }

    #[test]
    fn rgb_and_grey_pngs_are_accepted_too() {
        let rgb = encode(2, 1, png::ColorType::Rgb, &[1, 2, 3, 4, 5, 6]);
        assert_eq!(decode(&make_thumbnail(&rgb, 460).unwrap()), (2, 1, vec![1, 2, 3, 255, 4, 5, 6, 255]));
        let grey = encode(2, 1, png::ColorType::Grayscale, &[9, 200]);
        assert_eq!(decode(&make_thumbnail(&grey, 460).unwrap()), (2, 1, vec![9, 9, 9, 255, 200, 200, 200, 255]));
    }

    #[test]
    fn something_that_is_not_a_png_is_an_error_not_a_panic() {
        assert!(make_thumbnail(b"not a png", 460).is_err());
        assert!(make_thumbnail(&[], 460).is_err());
    }
}
