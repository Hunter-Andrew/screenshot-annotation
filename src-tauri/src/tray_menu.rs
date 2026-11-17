//! The tray menu (ticket 23): what it lists, in which order, and what each id means. Pure, so it is
//! tested on any OS (`rustc --test src/tray_menu.rs`, or `cargo test`); `lib.rs` turns the entries into
//! native menu items and runs the actions.

/// What a menu click asks the app to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Capture,
    /// Capture after this many seconds (the delay timer; `delay::delay_for` has the last word).
    CaptureIn(u32),
    OpenEditor,
    Settings,
    OpenLogFolder,
    Exit,
}

/// One row of the menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Entry {
    Item { id: String, label: String },
    Separator,
}

fn item(id: &str, label: &str) -> Entry {
    Entry::Item { id: id.into(), label: label.into() }
}

/// The menu, top to bottom. `delays` are the seconds offered by the delay timer.
pub fn entries(delays: &[u32]) -> Vec<Entry> {
    let mut menu = vec![item("capture", "Capture")];
    menu.extend(delays.iter().map(|s| item(&format!("capture-{s}"), &format!("Capture in {s}s"))));
    menu.push(Entry::Separator);
    menu.push(item("editor", "Open editor"));
    menu.push(item("settings", "Settings"));
    menu.push(item("log", "Open log folder"));
    menu.push(Entry::Separator);
    menu.push(item("exit", "Exit"));
    menu
}

/// The action for a clicked item id; `None` for an id that is not on the menu.
pub fn action_for(id: &str) -> Option<Action> {
    match id {
        "capture" => Some(Action::Capture),
        "editor" => Some(Action::OpenEditor),
        "settings" => Some(Action::Settings),
        "log" => Some(Action::OpenLogFolder),
        "exit" => Some(Action::Exit),
        _ => {
            let seconds = id.strip_prefix("capture-")?;
            // Digits only: no sign, no space.
            if seconds.is_empty() || !seconds.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            seconds.parse().ok().map(Action::CaptureIn)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(menu: &[Entry]) -> Vec<&str> {
        menu.iter()
            .map(|e| match e {
                Entry::Item { label, .. } => label.as_str(),
                Entry::Separator => "-",
            })
            .collect()
    }

    #[test]
    fn the_menu_lists_every_action_in_the_documented_order() {
        assert_eq!(
            labels(&entries(&[3, 5, 10])),
            ["Capture", "Capture in 3s", "Capture in 5s", "Capture in 10s", "-", "Open editor", "Settings", "Open log folder", "-", "Exit"]
        );
    }

    #[test]
    fn every_item_id_maps_to_its_action() {
        let mut seen = Vec::new();
        for entry in entries(&[3, 5, 10]) {
            if let Entry::Item { id, .. } = entry {
                seen.push(action_for(&id).unwrap_or_else(|| panic!("{id} has no action")));
            }
        }
        assert_eq!(
            seen,
            [
                Action::Capture,
                Action::CaptureIn(3),
                Action::CaptureIn(5),
                Action::CaptureIn(10),
                Action::OpenEditor,
                Action::Settings,
                Action::OpenLogFolder,
                Action::Exit
            ]
        );
    }

    #[test]
    fn item_ids_are_unique() {
        let ids: Vec<String> =
            entries(&[3, 5, 10]).into_iter().filter_map(|e| if let Entry::Item { id, .. } = e { Some(id) } else { None }).collect();
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), ids.len());
    }

    #[test]
    fn unknown_ids_and_malformed_delays_do_nothing() {
        for id in ["", "nope", "capture-", "capture-x", "capture--3", "Capture"] {
            assert_eq!(action_for(id), None, "{id:?}");
        }
    }
}
