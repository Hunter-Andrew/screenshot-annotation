//! The pure decisions of Drawing mode (tickets 52 and 53): what its hotkey or tray item does, how its
//! overlay windows are named, which tools exist, and where the toolbar window goes and how big it is. No dependencies, so it is tested on any OS (`rustc --test
//! src/drawing_plan.rs`, or `cargo test`); `drawing.rs` does the window work.

/// Drawing mode's overlay windows are named `drawing-<monitor index>`; the capture overlay's are `overlay-<index>`.
pub const LABEL_PREFIX: &str = "drawing-";

pub fn label(monitor: usize) -> String {
    format!("{LABEL_PREFIX}{monitor}")
}

pub fn is_label(name: &str) -> bool {
    name.strip_prefix(LABEL_PREFIX).is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_digit()))
}

/// The toolbar's window label. It does not match `is_label` (the overlays), so the overlay loops never take it
/// for one; `is_window` covers both. `capabilities/default.json` lists `drawing-*`, which covers it.
pub const TOOLBAR_LABEL: &str = "drawing-toolbar";

/// Every window Drawing mode owns: the overlays and the toolbar.
pub fn is_window(name: &str) -> bool {
    is_label(name) || name == TOOLBAR_LABEL
}

/// The four tools, as the page names them (`DRAWING_TOOLS` in src/drawing/drawingState.ts); Arrow is the first.
pub const TOOLS: [&str; 4] = ["arrow", "rect", "pen", "highlight"];
pub const DEFAULT_TOOL: &str = "arrow";

pub fn is_tool(name: &str) -> bool {
    TOOLS.contains(&name)
}

/// The toolbar's size in CSS pixels when expanded (`DRAWING_TOOLBAR_SIZE` in src/shared/constants.ts; the page
/// asks for the collapsed size itself).
pub const TOOLBAR_WIDTH: u32 = 356;
pub const TOOLBAR_HEIGHT: u32 = 48;
/// The gap between the top of the monitor and the toolbar, in CSS pixels.
pub const TOOLBAR_TOP_GAP: u32 = 12;

/// Where the toolbar opens and how big it is, in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// The toolbar's place on a monitor, given as (x, y, width, height) in physical pixels with its scale factor:
/// centred along the top edge, a little below it, at the monitor's own scale.
pub fn toolbar_placement(monitor: (i32, i32, u32, u32), scale: f64) -> Placement {
    let (mx, my, mw, _mh) = monitor;
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let width = (TOOLBAR_WIDTH as f64 * scale).round() as u32;
    let height = (TOOLBAR_HEIGHT as f64 * scale).round() as u32;
    let gap = (TOOLBAR_TOP_GAP as f64 * scale).round() as i32;
    // On a monitor narrower than the toolbar it sits at the left edge rather than hanging off it.
    let left = (mw as i64 - width as i64).max(0) / 2;
    Placement { x: mx + left as i32, y: my + gap, width, height }
}

/// The size the page asks the toolbar to take (CSS pixels): kept to a sane range, and None for anything else
/// (NaN, zero, negative, enormous), so a bad request never resizes the window.
pub fn toolbar_request(width: f64, height: f64) -> Option<(f64, f64)> {
    let fine = |v: f64| v.is_finite() && (1.0..=1000.0).contains(&v);
    (fine(width) && fine(height)).then_some((width, height))
}

/// What a press of the hotkey (or a click on the tray item) does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Toggle {
    Start,
    End,
    /// A capture overlay or countdown is open: the mode does not start under it.
    Ignore,
}

/// `active`: Drawing mode is on. `capturing`: a capture (its countdown or overlay) is in progress.
/// Leaving the mode is always allowed; starting it is not while a capture is in progress.
pub fn toggle(active: bool, capturing: bool) -> Toggle {
    match (active, capturing) {
        (true, _) => Toggle::End,
        (false, false) => Toggle::Start,
        (false, true) => Toggle::Ignore,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_hotkey_starts_the_mode_and_pressing_it_again_ends_it() {
        assert_eq!(toggle(false, false), Toggle::Start);
        assert_eq!(toggle(true, false), Toggle::End);
    }

    #[test]
    fn the_mode_does_not_start_while_a_capture_is_in_progress() {
        assert_eq!(toggle(false, true), Toggle::Ignore);
    }

    #[test]
    fn the_mode_can_always_be_left() {
        assert_eq!(toggle(true, true), Toggle::End);
    }

    #[test]
    fn the_toolbar_is_a_drawing_window_that_is_not_an_overlay() {
        assert!(!is_label(TOOLBAR_LABEL));
        assert!(is_window(TOOLBAR_LABEL));
        assert!(is_window("drawing-2"));
        for name in ["overlay-0", "editor", "settings", "countdown", "pointer-highlight", "drawing-toolbar2", ""] {
            assert!(!is_window(name), "{name:?}");
        }
        assert!(TOOLBAR_LABEL.starts_with(LABEL_PREFIX), "capabilities/default.json lists drawing-*");
    }

    #[test]
    fn the_tools_are_the_pages_four_and_arrow_comes_first() {
        assert_eq!(TOOLS, ["arrow", "rect", "pen", "highlight"]);
        assert_eq!(DEFAULT_TOOL, "arrow");
        assert!(is_tool("pen"));
        for name in ["", "Pen", "line", "select", "arrow "] {
            assert!(!is_tool(name), "{name:?}");
        }
    }

    #[test]
    fn the_toolbar_opens_top_centre_of_a_monitor_at_its_scale() {
        // 1920x1080 at 100%: 356 wide, centred, 12 below the top.
        assert_eq!(toolbar_placement((0, 0, 1920, 1080), 1.0), Placement { x: 782, y: 12, width: 356, height: 48 });
        // 3840x2160 at 200%: twice the size, twice the gap, still centred.
        assert_eq!(toolbar_placement((0, 0, 3840, 2160), 2.0), Placement { x: 1564, y: 24, width: 712, height: 96 });
    }

    #[test]
    fn the_toolbar_follows_a_monitor_left_of_or_above_the_primary() {
        assert_eq!(toolbar_placement((-1920, -200, 1920, 1080), 1.0), Placement { x: -1138, y: -188, width: 356, height: 48 });
        assert_eq!(toolbar_placement((1920, 0, 1280, 1024), 1.25), Placement { x: 1920 + 417, y: 15, width: 445, height: 60 });
    }

    #[test]
    fn a_monitor_narrower_than_the_toolbar_puts_it_at_the_left_edge_and_a_bad_scale_counts_as_100_percent() {
        assert_eq!(toolbar_placement((100, 0, 300, 600), 1.0).x, 100);
        assert_eq!(toolbar_placement((0, 0, 1920, 1080), 0.0), toolbar_placement((0, 0, 1920, 1080), 1.0));
        assert_eq!(toolbar_placement((0, 0, 1920, 1080), f64::NAN), toolbar_placement((0, 0, 1920, 1080), 1.0));
    }

    #[test]
    fn the_toolbar_only_resizes_to_a_sane_size() {
        assert_eq!(toolbar_request(356.0, 48.0), Some((356.0, 48.0)));
        assert_eq!(toolbar_request(72.0, 48.0), Some((72.0, 48.0)));
        for (w, h) in [(0.0, 48.0), (-5.0, 48.0), (356.0, f64::NAN), (f64::INFINITY, 48.0), (5000.0, 48.0)] {
            assert_eq!(toolbar_request(w, h), None, "{w} x {h}");
        }
    }

    #[test]
    fn windows_are_named_by_monitor_and_never_clash_with_the_capture_overlays() {
        assert_eq!(label(0), "drawing-0");
        assert_eq!(label(12), "drawing-12");
        assert!(is_label("drawing-0"));
        assert!(is_label("drawing-12"));
        for name in ["overlay-0", "drawing-", "drawing-x", "drawing-1a", "editor", "settings", "countdown", ""] {
            assert!(!is_label(name), "{name:?}");
        }
    }
}
