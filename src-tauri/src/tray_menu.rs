//! The tray menu (ticket 23): what it lists, in which order, and what each id means. Pure, so it is
//! tested on any OS (`rustc --test src/tray_menu.rs`, or `cargo test`); `lib.rs` turns the entries into
//! native menu items and runs the actions.

/// What a menu click asks the app to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Capture,
    /// Capture after this many seconds (the delay timer; `delay::delay_for` has the last word).
    CaptureIn(u32),
    /// Start Drawing mode, or end it when it is on (ticket 52; same as its hotkey).
    DrawOnScreen,
    OpenEditor,
    Settings,
    OpenLogFolder,
    /// Switch the pointer highlight on or off (ticket 50).
    TogglePointerHighlight,
    Exit,
}

/// One row of the menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Entry {
    Item { id: String, label: String },
    /// An item with a check mark (the pointer highlight, ticket 50).
    Check { id: String, label: String, checked: bool },
    Separator,
}

fn item(id: &str, label: &str) -> Entry {
    Entry::Item { id: id.into(), label: label.into() }
}

/// Id of the checked "Pointer highlight" item.
pub const POINTER_HIGHLIGHT_ID: &str = "pointer-highlight";

/// A hotkey the way Settings shows it, e.g. "Ctrl+Shift+L" (mirrors `formatCombo` in `src/settings/hotkey.ts`).
/// `accelerator` is the stored form ("ctrl+shift+l"). Modifier names are matched without regard to case and
/// through their aliases; "ArrowUp" is "Up", "PrintScreen" is "Print Screen", a single character is upper case,
/// any other key keeps its spelling.
pub fn format_accelerator(accelerator: &str) -> String {
    let shown: Vec<String> = accelerator
        .split('+')
        .map(|part| match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" | "commandorcontrol" | "cmdorctrl" => "Ctrl".to_string(),
            "shift" => "Shift".to_string(),
            "alt" | "option" => "Alt".to_string(),
            "super" | "meta" | "cmd" | "command" | "win" => "Win".to_string(),
            "printscreen" => "Print Screen".to_string(),
            lower if lower.starts_with("arrow") && lower.len() > 5 => part[5..].to_string(),
            lower if lower.chars().count() == 1 => lower.to_uppercase(),
            _ => part.to_string(),
        })
        .collect();
    shown.join("+")
}

/// The label of the pointer highlight item: its name and its hotkey, e.g. "Pointer highlight (Ctrl+Shift+L)".
pub fn pointer_highlight_label(accelerator: &str) -> String {
    format!("Pointer highlight ({})", format_accelerator(accelerator))
}

/// The id of the "Draw on screen" item (`lib.rs` keeps a handle to it to refresh its label).
pub const DRAW_ID: &str = "draw";

/// The label of the "Draw on screen" item: the Drawing mode hotkey (an accelerator such as "ctrl+shift+d") shown in brackets.
pub fn draw_label(accelerator: &str) -> String {
    format!("Draw on screen ({})", format_accelerator(accelerator))
}

/// The menu, top to bottom. `delays` are the seconds offered by the delay timer; `pointer_hotkey` is the
/// pointer highlight's hotkey (shown in its label), `pointer_on` whether it is on now (the check mark), and
/// `drawing_hotkey` the Drawing mode hotkey the "Draw on screen" item shows.
pub fn entries(delays: &[u32], pointer_hotkey: &str, pointer_on: bool, drawing_hotkey: &str) -> Vec<Entry> {
    let mut menu = vec![item("capture", "Capture")];
    menu.extend(delays.iter().map(|s| item(&format!("capture-{s}"), &format!("Capture in {s}s"))));
    menu.push(Entry::Separator);
    menu.push(Entry::Check {
        id: POINTER_HIGHLIGHT_ID.into(),
        label: pointer_highlight_label(pointer_hotkey),
        checked: pointer_on,
    });
    menu.push(item(DRAW_ID, &draw_label(drawing_hotkey)));
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
        DRAW_ID => Some(Action::DrawOnScreen),
        "editor" => Some(Action::OpenEditor),
        "settings" => Some(Action::Settings),
        "log" => Some(Action::OpenLogFolder),
        POINTER_HIGHLIGHT_ID => Some(Action::TogglePointerHighlight),
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
                Entry::Item { label, .. } | Entry::Check { label, .. } => label.as_str(),
                Entry::Separator => "-",
            })
            .collect()
    }

    #[test]
    fn the_menu_lists_every_action_in_the_documented_order() {
        assert_eq!(
            labels(&entries(&[3, 5, 10], "ctrl+shift+l", false, "ctrl+shift+d")),
            [
                "Capture",
                "Capture in 3s",
                "Capture in 5s",
                "Capture in 10s",
                "-",
                "Pointer highlight (Ctrl+Shift+L)",
                "Draw on screen (Ctrl+Shift+D)",
                "-",
                "Open editor",
                "Settings",
                "Open log folder",
                "-",
                "Exit"
            ]
        );
    }

    #[test]
    fn every_item_id_maps_to_its_action() {
        let mut seen = Vec::new();
        for entry in entries(&[3, 5, 10], "ctrl+shift+l", false, "ctrl+shift+d") {
            if let Entry::Item { id, .. } | Entry::Check { id, .. } = entry {
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
                Action::TogglePointerHighlight,
                Action::DrawOnScreen,
                Action::OpenEditor,
                Action::Settings,
                Action::OpenLogFolder,
                Action::Exit
            ]
        );
    }

    #[test]
    fn item_ids_are_unique() {
        let ids: Vec<String> = entries(&[3, 5, 10], "ctrl+shift+l", false, "ctrl+shift+d")
            .into_iter()
            .filter_map(|e| if let Entry::Item { id, .. } | Entry::Check { id, .. } = e { Some(id) } else { None })
            .collect();
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), ids.len());
    }

    #[test]
    fn the_draw_item_shows_the_hotkey_it_is_bound_to() {
        assert_eq!(draw_label("ctrl+shift+d"), "Draw on screen (Ctrl+Shift+D)");
        assert_eq!(draw_label("ctrl+alt+F5"), "Draw on screen (Ctrl+Alt+F5)");
        assert_eq!(draw_label("super+shift+x"), "Draw on screen (Win+Shift+X)");
        assert_eq!(draw_label("ctrl+alt+ArrowUp"), "Draw on screen (Ctrl+Alt+Up)");
        assert_eq!(draw_label("ctrl+alt+F12"), "Draw on screen (Ctrl+Alt+F12)");
    }

    #[test]
    fn the_draw_item_has_its_own_action() {
        assert_eq!(action_for(DRAW_ID), Some(Action::DrawOnScreen));
        assert_eq!(action_for("draw-3"), None);
    }

    #[test]
    fn unknown_ids_and_malformed_delays_do_nothing() {
        for id in ["", "nope", "capture-", "capture-x", "capture--3", "Capture"] {
            assert_eq!(action_for(id), None, "{id:?}");
        }
    }

    #[test]
    fn the_pointer_highlight_item_is_checked_only_while_the_highlight_is_on() {
        let checked = |on: bool| {
            entries(&[3], "ctrl+shift+l", on, "ctrl+shift+d")
                .into_iter()
                .find_map(|e| match e {
                    Entry::Check { id, checked, .. } if id == POINTER_HIGHLIGHT_ID => Some(checked),
                    _ => None,
                })
        };
        assert_eq!(checked(false), Some(false));
        assert_eq!(checked(true), Some(true));
    }

    #[test]
    fn both_labels_show_a_hotkey_the_same_way_whatever_its_case_or_alias() {
        for accelerator in ["CTRL+Shift+l", "control+SHIFT+L", "CommandOrControl+shift+l", "ctrl+shift+l"] {
            assert_eq!(format_accelerator(accelerator), "Ctrl+Shift+L", "{accelerator}");
            assert_eq!(pointer_highlight_label(accelerator), "Pointer highlight (Ctrl+Shift+L)");
            assert_eq!(draw_label(accelerator), "Draw on screen (Ctrl+Shift+L)");
        }
        assert_eq!(format_accelerator("Alt+super+arrowup"), "Alt+Win+up");
        assert_eq!(format_accelerator("ctrl+PrintScreen"), "Ctrl+Print Screen");
        assert_eq!(format_accelerator("ctrl+Arrow"), "Ctrl+Arrow");
    }

    #[test]
    fn the_label_shows_the_hotkey_the_way_settings_does() {
        assert_eq!(pointer_highlight_label("ctrl+shift+l"), "Pointer highlight (Ctrl+Shift+L)");
        assert_eq!(pointer_highlight_label("ctrl+alt+F9"), "Pointer highlight (Ctrl+Alt+F9)");
        assert_eq!(pointer_highlight_label("super+ArrowUp"), "Pointer highlight (Win+Up)");
        assert_eq!(pointer_highlight_label("ctrl+Space"), "Pointer highlight (Ctrl+Space)");
    }
}
