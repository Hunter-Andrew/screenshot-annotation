//! The laser pointer's maths (ticket 50): how big the dot's window is on a monitor, where it sits
//! while the pointer moves, in which order a monitor change is applied, and when a left click shows the
//! ripple. Pure, so it is tested on any OS (`rustc --test src/laser_pointer_math.rs`, or `cargo test`). The window
//! and the polling thread are in `laser_pointer.rs`; what the dot looks like is in
//! `src/laserPointer/laserPointerStyle.ts`.

/// A monitor's rectangle on the virtual screen, physical pixels: x, y, width, height.
pub type Rect = (i32, i32, u32, u32);

/// The edge of the square dot window in physical pixels at 100% scale: room for the Large dot's glow and the
/// click ripple (the page draws in CSS pixels, so the window grows with the monitor's scale factor and the
/// dot looks the same size on every monitor).
pub const WINDOW_SIZE: u32 = 96;

/// The window's edge on a monitor with this scale factor (1.0 is 100%). Never below 1; a scale that is not a
/// positive number counts as 1.0.
pub fn window_size(scale: f64) -> u32 {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    ((WINDOW_SIZE as f64 * scale).round() as u32).max(1)
}

/// Top-left of a window of edge `size` that has the pointer at its centre, moved as little as needed to stay
/// inside `monitor` (so it never straddles two monitors that may have different scales). On a monitor smaller
/// than the window the window sits at the monitor's top-left.
pub fn window_origin(cursor: (i32, i32), size: u32, monitor: Rect) -> (i32, i32) {
    let (mx, my, mw, mh) = monitor;
    let size = size as i32;
    let place = |at: i32, start: i32, len: u32| {
        let end = start + len as i32;
        (at - size / 2).clamp(start, (end - size).max(start))
    };
    (place(cursor.0, mx, mw), place(cursor.1, my, mh))
}

/// Where the pointer is inside a window whose top-left is `origin`, physical pixels.
pub fn pointer_in_window(cursor: (i32, i32), origin: (i32, i32)) -> (i32, i32) {
    (cursor.0 - origin.0, cursor.1 - origin.1)
}

/// One change to the window. `Position` always comes before `Size`: the window is first moved onto the
/// monitor the pointer is on, then given that monitor's size, so the size is applied at the target scale
/// (Windows resizes a window that crosses to a monitor with another scale; the size set last wins).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Apply {
    Position(i32, i32),
    Size(u32),
}

/// What the polling loop read this tick.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Sample {
    /// The pointer on the virtual screen, physical pixels.
    pub cursor: (i32, i32),
    /// The left mouse button is down.
    pub left_down: bool,
    /// The monitor the pointer is on, and its scale factor.
    pub monitor: Rect,
    pub scale: f64,
}

/// What to do for one tick.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Frame {
    /// Window changes, in the order to apply them (empty when nothing moved).
    pub apply: Vec<Apply>,
    /// Where the dot's centre is inside the window, in CSS pixels, when that changed (and on the first tick).
    pub dot: Option<(f64, f64)>,
    /// A left click began: show the ripple.
    pub ripple: bool,
}

/// Remembers what was last applied, so each tick only asks for what changed.
#[derive(Debug, Default)]
pub struct Tracker {
    position: Option<(i32, i32)>,
    size: Option<u32>,
    dot: Option<((i32, i32), u32)>,
    left_was_down: Option<bool>,
}

impl Tracker {
    pub fn new() -> Self {
        Tracker::default()
    }

    /// The decisions for one tick. The ripple fires on the edge from up to down of the left button, only when
    /// `ripple_on`; a button already down on the first tick (the hotkey was pressed with it held) and one held
    /// while the ripple was switched off do not fire when they are noticed.
    pub fn next(&mut self, sample: &Sample, ripple_on: bool) -> Frame {
        let size = window_size(sample.scale);
        let origin = window_origin(sample.cursor, size, sample.monitor);
        let mut apply = Vec::new();
        if self.position != Some(origin) {
            apply.push(Apply::Position(origin.0, origin.1));
            self.position = Some(origin);
        }
        if self.size != Some(size) {
            apply.push(Apply::Size(size));
            self.size = Some(size);
        }
        let inside = pointer_in_window(sample.cursor, origin);
        let dot = if self.dot != Some((inside, size)) {
            self.dot = Some((inside, size));
            let scale = size as f64 / WINDOW_SIZE as f64;
            Some((inside.0 as f64 / scale, inside.1 as f64 / scale))
        } else {
            None
        };
        let ripple = ripple_on && sample.left_down && self.left_was_down == Some(false);
        self.left_was_down = Some(sample.left_down);
        Frame { apply, dot, ripple }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRIMARY: Rect = (0, 0, 1920, 1080);
    const LAPTOP: Rect = (1920, 0, 2560, 1600);

    fn at(cursor: (i32, i32), monitor: Rect, scale: f64) -> Sample {
        Sample { cursor, left_down: false, monitor, scale }
    }

    #[test]
    fn the_window_grows_with_the_monitors_scale_factor() {
        assert_eq!(window_size(1.0), 96);
        assert_eq!(window_size(1.25), 120);
        assert_eq!(window_size(1.5), 144);
        assert_eq!(window_size(2.0), 192);
        assert_eq!(window_size(1.75), 168);
    }

    #[test]
    fn a_scale_that_makes_no_sense_is_100_percent() {
        for bad in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert_eq!(window_size(bad), 96, "{bad}");
        }
    }

    #[test]
    fn the_window_is_centred_on_the_pointer() {
        assert_eq!(window_origin((500, 400), 96, PRIMARY), (452, 352));
        assert_eq!(window_origin((2000, 100), 120, LAPTOP), (1940, 40));
    }

    #[test]
    fn the_window_is_clamped_to_the_monitor_the_pointer_is_on() {
        assert_eq!(window_origin((0, 0), 96, PRIMARY), (0, 0));
        assert_eq!(window_origin((1919, 1079), 96, PRIMARY), (1824, 984));
        // Just inside the laptop screen's left edge: the window stays on that screen, not on the other one.
        assert_eq!(window_origin((1921, 800), 120, LAPTOP), (1920, 740));
        assert_eq!(window_origin((-300, 5), 96, (-1280, 56, 1280, 1024)), (-348, 56));
    }

    #[test]
    fn a_monitor_smaller_than_the_window_gets_the_window_at_its_top_left() {
        assert_eq!(window_origin((50, 50), 96, (10, 20, 40, 40)), (10, 20));
    }

    #[test]
    fn where_the_pointer_is_inside_the_window_follows_the_clamp() {
        assert_eq!(pointer_in_window((500, 400), (452, 352)), (48, 48));
        assert_eq!(pointer_in_window((0, 0), (0, 0)), (0, 0));
        assert_eq!(pointer_in_window((1919, 1079), (1824, 984)), (95, 95));
    }

    #[test]
    fn the_first_tick_places_then_sizes_and_reports_the_dot() {
        let mut t = Tracker::new();
        let f = t.next(&at((500, 400), PRIMARY, 1.0), true);
        assert_eq!(f.apply, [Apply::Position(452, 352), Apply::Size(96)]);
        assert_eq!(f.dot, Some((48.0, 48.0)));
        assert!(!f.ripple);
    }

    #[test]
    fn moving_on_one_monitor_only_moves() {
        let mut t = Tracker::new();
        t.next(&at((500, 400), PRIMARY, 1.0), true);
        let f = t.next(&at((510, 400), PRIMARY, 1.0), true);
        assert_eq!(f.apply, [Apply::Position(462, 352)]);
        assert_eq!(f.dot, None);
    }

    #[test]
    fn standing_still_asks_for_nothing() {
        let mut t = Tracker::new();
        t.next(&at((500, 400), PRIMARY, 1.0), true);
        assert_eq!(t.next(&at((500, 400), PRIMARY, 1.0), true), Frame::default());
    }

    #[test]
    fn crossing_to_a_monitor_with_another_scale_sets_the_position_before_the_size() {
        let mut t = Tracker::new();
        t.next(&at((1900, 500), PRIMARY, 1.0), true);
        let f = t.next(&at((1930, 500), LAPTOP, 1.5), true);
        assert_eq!(f.apply, [Apply::Position(1920, 428), Apply::Size(144)]);
    }

    #[test]
    fn crossing_between_monitors_of_the_same_scale_does_not_resize() {
        let mut t = Tracker::new();
        t.next(&at((1900, 500), PRIMARY, 1.0), true);
        let f = t.next(&at((1960, 500), (1920, 0, 1920, 1080), 1.0), true);
        assert_eq!(f.apply, [Apply::Position(1920, 452)]);
    }

    #[test]
    fn the_dot_is_reported_in_css_pixels_when_clamping_moves_it_off_centre() {
        let mut t = Tracker::new();
        let f = t.next(&at((1920, 0), LAPTOP, 1.5), true);
        assert_eq!(f.apply, [Apply::Position(1920, 0), Apply::Size(144)]);
        assert_eq!(f.dot, Some((0.0, 0.0)));
        let f = t.next(&at((1950, 0), LAPTOP, 1.5), true);
        // 30 physical px into a 144 px window at 150% is 20 CSS px; at the top edge the pointer is at 0.
        assert_eq!(f.dot, Some((20.0, 0.0)));
    }

    fn click(left_down: bool) -> Sample {
        Sample { left_down, ..at((100, 100), PRIMARY, 1.0) }
    }

    #[test]
    fn the_ripple_fires_once_per_left_press() {
        let mut t = Tracker::new();
        assert!(!t.next(&click(false), true).ripple);
        assert!(t.next(&click(true), true).ripple);
        assert!(!t.next(&click(true), true).ripple, "held");
        assert!(!t.next(&click(false), true).ripple, "released");
        assert!(t.next(&click(true), true).ripple, "pressed again");
    }

    #[test]
    fn a_button_already_down_when_the_highlight_starts_does_not_ripple() {
        let mut t = Tracker::new();
        assert!(!t.next(&click(true), true).ripple);
        assert!(!t.next(&click(true), true).ripple);
    }

    #[test]
    fn with_the_ripple_off_nothing_fires_and_a_held_button_does_not_fire_when_it_is_switched_on() {
        let mut t = Tracker::new();
        t.next(&click(false), false);
        assert!(!t.next(&click(true), false).ripple);
        assert!(!t.next(&click(true), true).ripple, "switched on while held");
        t.next(&click(false), true);
        assert!(t.next(&click(true), true).ripple);
    }
}
