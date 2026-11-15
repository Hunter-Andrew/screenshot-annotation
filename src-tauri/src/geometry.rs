//! Pure geometry of the capture overlay on the virtual screen. No dependencies, so it is tested
//! on any OS (`rustc --test src/geometry.rs`, or `cargo test`).
//!
//! The virtual screen spans all monitors in physical pixels. Its origin is the primary monitor's
//! top-left, so a monitor left of or above the primary has negative coordinates.

/// A monitor's rectangle on the virtual screen, in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MonitorBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// A rectangle local to one monitor (0,0 is that monitor's top-left), in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Region {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Index of the monitor containing the point, or the nearest one when the point is in a gap or
/// outside every monitor (a cursor can sit on a corner between differently sized monitors).
pub fn monitor_at(monitors: &[MonitorBounds], px: i32, py: i32) -> Option<usize> {
    let distance = |m: &MonitorBounds| -> i64 {
        let dx = axis_gap(px as i64, m.x as i64, m.width as i64);
        let dy = axis_gap(py as i64, m.y as i64, m.height as i64);
        dx * dx + dy * dy
    };
    monitors
        .iter()
        .enumerate()
        .min_by_key(|(_, m)| distance(m))
        .map(|(i, _)| i)
}

/// Distance from `p` to the span `[start, start + len)`; 0 inside it.
fn axis_gap(p: i64, start: i64, len: i64) -> i64 {
    if p < start {
        start - p
    } else if p >= start + len {
        p - (start + len - 1)
    } else {
        0
    }
}

/// Clamp a requested region to a monitor of the given size. The UI already clamps, but the
/// region crosses a process boundary, so it is never trusted. `None` when nothing is left.
pub fn clamp_region(region: Region, monitor_width: u32, monitor_height: u32) -> Option<Region> {
    let x0 = region.x.min(monitor_width);
    let y0 = region.y.min(monitor_height);
    let x1 = region.x.saturating_add(region.width).min(monitor_width);
    let y1 = region.y.saturating_add(region.height).min(monitor_height);
    if x1 <= x0 || y1 <= y0 {
        return None;
    }
    Some(Region { x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
}

/// Copy a region out of tightly packed RGBA rows of a `width` x `height` image.
pub fn crop_rgba(rgba: &[u8], width: u32, height: u32, region: Region) -> Option<Vec<u8>> {
    if rgba.len() != (width as usize) * (height as usize) * 4 {
        return None;
    }
    let region = clamp_region(region, width, height)?;
    let stride = width as usize * 4;
    let row_bytes = region.width as usize * 4;
    let mut out = Vec::with_capacity(row_bytes * region.height as usize);
    for row in region.y..region.y + region.height {
        let start = row as usize * stride + region.x as usize * 4;
        out.extend_from_slice(&rgba[start..start + row_bytes]);
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Three monitors: a 1920x1080 primary at the origin, a 1280x1024 one to its left (negative x,
    // hanging lower than the primary's top), and a 2560x1440 one above-right (negative y).
    const LEFT: MonitorBounds = MonitorBounds { x: -1280, y: 56, width: 1280, height: 1024 };
    const PRIMARY: MonitorBounds = MonitorBounds { x: 0, y: 0, width: 1920, height: 1080 };
    const ABOVE: MonitorBounds = MonitorBounds { x: 1920, y: -360, width: 2560, height: 1440 };
    const ALL: [MonitorBounds; 3] = [LEFT, PRIMARY, ABOVE];

    #[test]
    fn monitor_at_finds_the_monitor_containing_a_point_with_negative_coordinates() {
        assert_eq!(monitor_at(&ALL, -1, 100), Some(0));
        assert_eq!(monitor_at(&ALL, -1280, 56), Some(0)); // top-left pixel of the left monitor
        assert_eq!(monitor_at(&ALL, 0, 0), Some(1));
        assert_eq!(monitor_at(&ALL, 1919, 1079), Some(1));
        assert_eq!(monitor_at(&ALL, 1920, -360), Some(2));
        assert_eq!(monitor_at(&ALL, 4479, 1079), Some(2)); // bottom-right pixel of the last one
    }

    #[test]
    fn monitor_at_falls_back_to_the_nearest_monitor_in_a_gap() {
        // Above the left monitor (it starts at y = 56), far from the primary: the left one is nearest.
        assert_eq!(monitor_at(&ALL, -500, 10), Some(0));
        // The same height just left of the primary: the primary is nearer.
        assert_eq!(monitor_at(&ALL, -10, 10), Some(1));
        // Below the primary's bottom edge, under the right monitor's x span.
        assert_eq!(monitor_at(&ALL, 3000, 1500), Some(2));
        assert_eq!(monitor_at(&[], 0, 0), None);
    }

    #[test]
    fn clamp_region_keeps_the_region_inside_the_monitor() {
        let r = Region { x: 1800, y: 1000, width: 500, height: 500 };
        assert_eq!(clamp_region(r, 1920, 1080), Some(Region { x: 1800, y: 1000, width: 120, height: 80 }));
        let inside = Region { x: 10, y: 20, width: 30, height: 40 };
        assert_eq!(clamp_region(inside, 1920, 1080), Some(inside));
    }

    #[test]
    fn clamp_region_is_none_when_nothing_is_left() {
        assert_eq!(clamp_region(Region { x: 1920, y: 0, width: 10, height: 10 }, 1920, 1080), None);
        assert_eq!(clamp_region(Region { x: 5, y: 5, width: 0, height: 10 }, 1920, 1080), None);
        // Overflow must not wrap around into a valid region.
        assert_eq!(
            clamp_region(Region { x: u32::MAX, y: 0, width: 10, height: 10 }, 1920, 1080),
            None
        );
    }

    #[test]
    fn crop_rgba_copies_exactly_the_requested_pixels() {
        // 4x3 image whose pixel (x, y) is [x, y, 0, 255].
        let mut rgba = Vec::new();
        for y in 0..3u8 {
            for x in 0..4u8 {
                rgba.extend_from_slice(&[x, y, 0, 255]);
            }
        }
        let cropped = crop_rgba(&rgba, 4, 3, Region { x: 1, y: 1, width: 2, height: 2 }).unwrap();
        assert_eq!(cropped, vec![1, 1, 0, 255, 2, 1, 0, 255, 1, 2, 0, 255, 2, 2, 0, 255]);
    }

    #[test]
    fn crop_rgba_rejects_a_buffer_that_does_not_match_the_size() {
        assert_eq!(crop_rgba(&[0; 8], 4, 3, Region { x: 0, y: 0, width: 1, height: 1 }), None);
    }
}
