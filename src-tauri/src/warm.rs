//! Which overlay windows to create, keep or close so there is one pre-warmed, hidden overlay per
//! monitor (ADR 0003, ticket 24). Pure, so it is tested on any OS (`rustc --test src/warm.rs`, or
//! `cargo test`); `overlay.rs` does the window work.
//!
//! Overlay windows are named by monitor index. The monitors can change while the app sits in the
//! tray (a screen plugged in or removed), so every capture asks this again with the monitors it
//! really found: windows that already exist are reused (and moved to their monitor), missing ones
//! are created on the spot, and ones for monitors that are gone are closed.

/// What to do with the overlay windows for `monitors` monitors.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OverlayPlan {
    /// Monitor indexes whose window exists already and is reused.
    pub reuse: Vec<usize>,
    /// Monitor indexes that have no window yet.
    pub create: Vec<usize>,
    /// Existing windows for monitors that no longer exist.
    pub destroy: Vec<usize>,
}

/// `existing`: the monitor indexes that have an overlay window now, in any order.
pub fn plan_overlays(existing: &[usize], monitors: usize) -> OverlayPlan {
    let mut existing = existing.to_vec();
    existing.sort_unstable();
    existing.dedup();
    OverlayPlan {
        reuse: existing.iter().copied().filter(|&i| i < monitors).collect(),
        create: (0..monitors).filter(|i| !existing.contains(i)).collect(),
        destroy: existing.iter().copied().filter(|&i| i >= monitors).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn at_startup_every_monitor_gets_a_window() {
        let plan = plan_overlays(&[], 3);
        assert_eq!(plan, OverlayPlan { reuse: vec![], create: vec![0, 1, 2], destroy: vec![] });
    }

    #[test]
    fn windows_that_exist_are_reused_and_only_the_missing_ones_are_created() {
        let plan = plan_overlays(&[1, 0], 3);
        assert_eq!(plan, OverlayPlan { reuse: vec![0, 1], create: vec![2], destroy: vec![] });
    }

    #[test]
    fn windows_for_monitors_that_are_gone_are_closed() {
        let plan = plan_overlays(&[0, 1, 2], 1);
        assert_eq!(plan, OverlayPlan { reuse: vec![0], create: vec![], destroy: vec![1, 2] });
    }

    #[test]
    fn a_gap_in_the_windows_is_filled_without_touching_the_rest() {
        let plan = plan_overlays(&[0, 2], 3);
        assert_eq!(plan, OverlayPlan { reuse: vec![0, 2], create: vec![1], destroy: vec![] });
    }

    #[test]
    fn nothing_to_do_when_every_window_is_there() {
        let plan = plan_overlays(&[0, 1], 2);
        assert_eq!(plan, OverlayPlan { reuse: vec![0, 1], create: vec![], destroy: vec![] });
    }
}
