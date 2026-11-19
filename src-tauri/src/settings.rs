//! App settings, stored as `settings.json` under Tauri's `app_data_dir` (the `<identifier>` folder
//! under %APPDATA%) so the installer's upgrade and "delete app data" behavior covers them (ticket 03).
//! Later tickets add their own fields; `#[serde(default)]` keeps older files loading.
//!
//! What the fields in `settings.json` mean (plain language; the user may open this file):
//! - `hotkey`: the capture hotkey, e.g. "ctrl+shift+s" or "PrintScreen". Change it in Settings, not here.
//! - `pointerHighlightHotkey` / `drawingModeHotkey`: the global hotkeys of the two demo tools, e.g.
//!   "ctrl+shift+l" and "ctrl+shift+d" (the defaults). Change them in Settings > Demo tools. Never Print
//!   Screen, the capture hotkey or each other; a value that breaks that, or is not text, becomes the default.
//! - `pointerColor` (`#RRGGBB`, default `#e02424`, red), `pointerSize` ("small", "medium" or "large"; default
//!   "medium") and `pointerRipple` (true by default): how the pointer highlight looks (ticket 50). Change them in
//!   Settings > Demo tools. Anything else is read as the default. Whether the highlight is on is never stored:
//!   it is off at every start.
//! - `pointerHideCursor` (true by default): while the pointer highlight is on, the Windows mouse arrow is hidden so
//!   only the dot shows. Set it to false (or untick it in Settings > Demo tools) to keep the arrow.
//! - `drawingHighlighterOpacity` (percent, 5 to 60, default 20): how solid Drawing mode's Highlighter is. Drawing
//!   mode takes the Highlighter's colour and thickness from the editor but not its opacity. Out-of-range numbers
//!   are brought into range; anything that is not a whole number is 20.
//! - `printScreenNoticeDismissed`: true means "you answered the one-time Print Screen notice" (clicked
//!   either of its two buttons). It only stops that notice from showing again. It does NOT mean Print
//!   Screen works or that the Windows setting is off; the warning under the hotkey field reads that live
//!   from Windows. Setting it back to false (with the app closed) shows the notice once more.
//! - `magnifier`: true shows the magnifier in the capture overlay. Default true (also when the field
//!   is missing from an older file). The M key in the overlay and the Settings checkbox both change
//!   it, and the last value is used by the next capture.
//! - `toolStyles`: each drawing tool's last style (color, thickness, fill...), so the next Annotation
//!   you draw with that tool starts the way you left it. One entry per tool ("arrow", "rect"...). The
//!   editor writes and checks it; a missing or unreadable entry just means that tool uses its default.
//!   Deleting the whole field (with the app closed) resets every tool to its default style.
//! - `shortcuts`: your changed keyboard shortcuts, one entry per action, e.g. `{"overlay.magnifier": "N"}`.
//!   Only changes are stored; a missing, unknown or invalid entry means that action keeps its default key.
//!   Deleting the field (with the app closed) restores every default. Change them in Settings, not here.
//! - `launchAtSignIn`: true (the default, also when the field is missing) starts the app in the tray when
//!   you sign in to Windows, through a value in the per-user Run key. Change it in Settings.
//! - `imageBackground`: what fills the part of a new image outside the Capture when it is made bigger than
//!   the Capture: "white", "dark" or "transparent" (the default, also when the field is missing or not one of
//!   those). The image keeps its own choice once it has one; this is only where it starts.
//! - `transparencyCheckerboard`: "light" (the default) or "dark": the checkerboard drawn behind transparent
//!   pixels in the editor and the Library. It changes how transparency looks, never an exported picture.
//! - `canvasMargin` (0 to 200 pixels, default 16): the room kept around the canvas in the editor view. (Before
//!   v0.5 the range was 16 to 200 with default 48; a stored value, 48 included, stays as stored, and a
//!   missing one is the new default.)
//! - `cropMargin` (0 to 400 pixels, default 150): the same room while the Crop tool is active.
//! - `darkBackground` (`#RRGGBB`, default `#191919`): the colour of a Dark image background, applied when the
//!   image is drawn (never stored with an image). Anything that is not `#RRGGBB` is the default.
//! - `outsideDarkness` (0 to 99.9 percent, to a tenth, default 95): how dark the area outside the canvas is shown.
//!   A stored value such as 60 stays as stored; one with more decimals is rounded to a tenth.
//! - `showOutsideDefault` (true by default): whether a new image shows the area outside its canvas.
//!   A number outside its range is brought into the range; anything that is not a number is the default.
//!   (A whole-number setting also takes a fraction as the default.)
//! - `libraryStripCollapsed` (false by default): whether the Library Strip along the bottom of the editor is
//!   collapsed to a thin bar. The chevron on the strip's edge changes it; it is kept between launches.
//! - `trayNoticeShown`: true once the one-time "still running in the tray" message, shown the first time
//!   the editor is closed, has been shown. Setting it back to false (with the app closed) shows it once more.

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const FILE_NAME: &str = "settings.json";
/// Where an unparseable settings.json is kept (see `load`).
pub const CORRUPT_FILE_NAME: &str = "settings.json.corrupt";
pub const DEFAULT_HOTKEY: &str = "ctrl+shift+s";
pub const DEFAULT_POINTER_HIGHLIGHT_HOTKEY: &str = "ctrl+shift+l";
pub const DEFAULT_DRAWING_MODE_HOTKEY: &str = "ctrl+shift+d";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Capture hotkey as an accelerator string, e.g. "ctrl+shift+s" or "PrintScreen".
    pub hotkey: String,
    /// Global hotkey that switches the pointer highlight on and off (ticket 49). Never Print Screen, the
    /// capture hotkey or the drawing-mode hotkey; anything unusable is the default.
    #[serde(deserialize_with = "pointer_highlight_hotkey_or_default")]
    pub pointer_highlight_hotkey: String,
    /// Global hotkey that starts and ends drawing mode (ticket 49); same rules.
    #[serde(deserialize_with = "drawing_mode_hotkey_or_default")]
    pub drawing_mode_hotkey: String,
    /// The pointer highlight's colour, `#rrggbb` (`DEFAULT_POINTER_COLOR`).
    #[serde(deserialize_with = "pointer_color_or_default")]
    pub pointer_color: String,
    /// The pointer highlight's size: one of `POINTER_SIZES`.
    #[serde(deserialize_with = "pointer_size_or_default")]
    pub pointer_size: String,
    /// Whether a left click shows the ripple (default true).
    #[serde(deserialize_with = "bool_or_true")]
    pub pointer_ripple: bool,
    /// Whether the pointer highlight hides the system mouse arrow while it is on (default true).
    #[serde(deserialize_with = "bool_or_true")]
    pub pointer_hide_cursor: bool,
    /// Drawing mode's Highlighter opacity in percent (`DRAWING_HIGHLIGHTER_OPACITY`).
    #[serde(deserialize_with = "drawing_highlighter_opacity_or_default")]
    pub drawing_highlighter_opacity: u32,
    /// The one-time Print Screen / Snipping Tool notice was answered.
    pub print_screen_notice_dismissed: bool,
    /// Show the magnifier in the capture overlay (default true).
    pub magnifier: bool,
    /// Each drawing tool's last style, by Annotation type. The platform does not look inside: the
    /// editor owns the shape (and validates it on read), so a new tool or group needs no change here.
    #[serde(deserialize_with = "object_or_empty")]
    pub tool_styles: serde_json::Map<String, serde_json::Value>,
    /// Keyboard shortcut overrides, action id to key (ticket 47). Only what the user changed; the
    /// platform does not look inside: the registry in the front end owns the ids and validates on read.
    #[serde(deserialize_with = "object_or_empty")]
    pub shortcuts: serde_json::Map<String, serde_json::Value>,
    /// Start the app when the user signs in to Windows (default true), through the HKCU Run key.
    pub launch_at_sign_in: bool,
    /// The one-time "still running in the tray" notice, shown the first time the editor is closed, was shown.
    pub tray_notice_shown: bool,
    /// What fills a new image outside the Capture once it is made bigger: one of `BACKGROUNDS`.
    #[serde(deserialize_with = "background_or_default")]
    pub image_background: String,
    /// The checkerboard behind transparent pixels: one of `CHECKERBOARDS`.
    #[serde(deserialize_with = "checkerboard_or_default")]
    pub transparency_checkerboard: String,
    /// The room kept around the canvas in the editor view, in pixels (`CANVAS_MARGIN`).
    #[serde(deserialize_with = "canvas_margin_or_default")]
    pub canvas_margin: u32,
    /// The room kept around the canvas while the Crop tool is active, in pixels (`CROP_MARGIN`).
    #[serde(deserialize_with = "crop_margin_or_default")]
    pub crop_margin: u32,
    /// The colour of a Dark image background, `#rrggbb` (`DEFAULT_DARK_BACKGROUND`).
    #[serde(deserialize_with = "dark_background_or_default")]
    pub dark_background: String,
    /// How dark the area outside the canvas is shown, in percent to a tenth (`OUTSIDE_DARKNESS`).
    #[serde(deserialize_with = "outside_darkness_or_default")]
    pub outside_darkness: f64,
    /// Whether a new image shows the area outside its canvas.
    #[serde(deserialize_with = "bool_or_true")]
    pub show_outside_default: bool,
    /// The Library Strip is collapsed to a thin bar (the chevron on its edge toggles it).
    #[serde(deserialize_with = "bool_or_false")]
    pub library_strip_collapsed: bool,
}

pub const BACKGROUNDS: [&str; 3] = ["white", "dark", "transparent"];
pub const CHECKERBOARDS: [&str; 2] = ["dark", "light"];
pub const DEFAULT_IMAGE_BACKGROUND: &str = "transparent";
pub const DEFAULT_CHECKERBOARD: &str = "light";
pub const POINTER_SIZES: [&str; 3] = ["small", "medium", "large"];
pub const DEFAULT_POINTER_SIZE: &str = "medium";
pub const DEFAULT_POINTER_COLOR: &str = "#e02424";

/// An inclusive range of whole numbers a numeric setting may take.
#[derive(Debug, Clone, Copy)]
pub struct Range {
    pub min: u32,
    pub max: u32,
    pub default: u32,
}

impl Range {
    pub fn clamp(&self, value: u32) -> u32 {
        value.clamp(self.min, self.max)
    }
    pub fn contains(&self, value: u32) -> bool {
        (self.min..=self.max).contains(&value)
    }
}

/// An inclusive range of numbers kept to a tenth (the outside darkness).
#[derive(Debug, Clone, Copy)]
pub struct DecimalRange {
    pub min: f64,
    pub max: f64,
    pub default: f64,
}

/// `value` rounded to a tenth.
fn tenths(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

impl DecimalRange {
    /// A number brought into the range and rounded to a tenth.
    pub fn clamp(&self, value: f64) -> f64 {
        tenths(value).clamp(self.min, self.max)
    }
    /// True for a finite number inside the range that has no more than one decimal place.
    pub fn contains(&self, value: f64) -> bool {
        value.is_finite() && tenths(value) == value && value >= self.min && value <= self.max
    }
}

pub const CANVAS_MARGIN: Range = Range { min: 0, max: 200, default: 16 };
/// Drawing mode's Highlighter opacity in percent; `DRAWING_HIGHLIGHTER_OPACITY` in src/drawing/drawingStyles.ts must match.
pub const DRAWING_HIGHLIGHTER_OPACITY: Range = Range { min: 5, max: 60, default: 20 };
pub const CROP_MARGIN: Range = Range { min: 0, max: 400, default: 150 };
pub const DEFAULT_DARK_BACKGROUND: &str = "#191919";

/// True for `#` followed by exactly six hex digits (either case).
pub fn is_hex_color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}
pub const OUTSIDE_DARKNESS: DecimalRange = DecimalRange { min: 0.0, max: 99.9, default: 95.0 };
pub const DEFAULT_SHOW_OUTSIDE: bool = true;

/// What the editor and the Library read: both image settings, as the frontend spells them.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSettings {
    pub background: String,
    pub checkerboard: String,
    pub canvas_margin: u32,
    pub crop_margin: u32,
    pub dark_background: String,
    pub outside_darkness: f64,
    pub show_outside_default: bool,
    pub library_strip_collapsed: bool,
}

/// A stored choice that is not one of `allowed` (a hand edit, a newer version) is the default, not an error.
fn choice_or<'de, D>(d: D, allowed: &[&str], default: &str) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::String(s) if allowed.contains(&s.as_str()) => s,
        _ => default.to_string(),
    })
}

fn background_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    choice_or(d, &BACKGROUNDS, DEFAULT_IMAGE_BACKGROUND)
}

fn checkerboard_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    choice_or(d, &CHECKERBOARDS, DEFAULT_CHECKERBOARD)
}

/// A stored whole number is brought into `range`; anything else (text, a fraction, null) is the default.
fn number_in<'de, D: serde::Deserializer<'de>>(d: D, range: Range) -> Result<u32, D::Error> {
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::Number(n) => match (n.as_u64(), n.as_i64()) {
            (Some(v), _) => range.clamp(v.min(u32::MAX as u64) as u32),
            (None, Some(_)) => range.min,
            _ => range.default,
        },
        _ => range.default,
    })
}

/// A stored number is rounded to a tenth and brought into `range`; anything else (text, null) is the default.
fn tenths_in<'de, D: serde::Deserializer<'de>>(d: D, range: DecimalRange) -> Result<f64, D::Error> {
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::Number(n) => n.as_f64().filter(|v| v.is_finite()).map_or(range.default, |v| range.clamp(v)),
        _ => range.default,
    })
}

fn canvas_margin_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    number_in(d, CANVAS_MARGIN)
}

fn drawing_highlighter_opacity_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    number_in(d, DRAWING_HIGHLIGHTER_OPACITY)
}

fn crop_margin_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    number_in(d, CROP_MARGIN)
}

/// A stored `#RRGGBB` is kept (lower-cased); anything else is the default.
fn dark_background_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::String(s) if is_hex_color(&s) => s.to_ascii_lowercase(),
        _ => DEFAULT_DARK_BACKGROUND.to_string(),
    })
}

fn outside_darkness_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    tenths_in(d, OUTSIDE_DARKNESS)
}

/// A stored `#RRGGBB` pointer colour is kept (lower-cased); anything else is red.
fn pointer_color_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::String(s) if is_hex_color(&s) => s.to_ascii_lowercase(),
        _ => DEFAULT_POINTER_COLOR.to_string(),
    })
}

fn pointer_size_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    choice_or(d, &POINTER_SIZES, DEFAULT_POINTER_SIZE)
}

fn bool_or_true<'de, D: serde::Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::Bool(b) => b,
        _ => DEFAULT_SHOW_OUTSIDE,
    })
}

/// A stored demo hotkey is kept when it is a non-empty string that is not Print Screen; anything else is `default`.
fn demo_hotkey_or<'de, D: serde::Deserializer<'de>>(d: D, default: &str) -> Result<String, D::Error> {
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::String(s) if !s.trim().is_empty() && !crate::hotkey::uses_print_screen(&s) => s,
        _ => default.to_string(),
    })
}

fn pointer_highlight_hotkey_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    demo_hotkey_or(d, DEFAULT_POINTER_HIGHLIGHT_HOTKEY)
}

fn drawing_mode_hotkey_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    demo_hotkey_or(d, DEFAULT_DRAWING_MODE_HOTKEY)
}

/// A hand-edited file may give both demo tools, or a demo tool and the capture hotkey, the same
/// combination: the later field falls back to its default so each combination has one action.
fn resolve_demo_hotkey_clashes(s: &mut Settings) {
    if crate::hotkey::demo_refusal(&s.pointer_highlight_hotkey, &s.hotkey, &s.drawing_mode_hotkey).is_some() {
        s.pointer_highlight_hotkey = DEFAULT_POINTER_HIGHLIGHT_HOTKEY.into();
    }
    if crate::hotkey::demo_refusal(&s.drawing_mode_hotkey, &s.hotkey, &s.pointer_highlight_hotkey).is_some() {
        s.drawing_mode_hotkey = DEFAULT_DRAWING_MODE_HOTKEY.into();
    }
}

fn bool_or_false<'de, D: serde::Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    Ok(matches!(serde_json::Value::deserialize(d)?, serde_json::Value::Bool(true)))
}

/// How the pointer highlight looks, as the frontend spells it (Settings > Demo tools, the dot window).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerSettings {
    pub color: String,
    pub size: String,
    pub ripple: bool,
}

impl Settings {
    pub fn pointer_settings(&self) -> PointerSettings {
        PointerSettings { color: self.pointer_color.clone(), size: self.pointer_size.clone(), ripple: self.pointer_ripple }
    }

    pub fn image_settings(&self) -> ImageSettings {
        ImageSettings {
            background: self.image_background.clone(),
            checkerboard: self.transparency_checkerboard.clone(),
            canvas_margin: self.canvas_margin,
            crop_margin: self.crop_margin,
            dark_background: self.dark_background.clone(),
            outside_darkness: self.outside_darkness,
            show_outside_default: self.show_outside_default,
            library_strip_collapsed: self.library_strip_collapsed,
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            hotkey: DEFAULT_HOTKEY.into(),
            pointer_highlight_hotkey: DEFAULT_POINTER_HIGHLIGHT_HOTKEY.into(),
            drawing_mode_hotkey: DEFAULT_DRAWING_MODE_HOTKEY.into(),
            pointer_color: DEFAULT_POINTER_COLOR.into(),
            pointer_size: DEFAULT_POINTER_SIZE.into(),
            pointer_ripple: true,
            pointer_hide_cursor: true,
            drawing_highlighter_opacity: DRAWING_HIGHLIGHTER_OPACITY.default,
            print_screen_notice_dismissed: false,
            magnifier: true,
            tool_styles: serde_json::Map::new(),
            shortcuts: serde_json::Map::new(),
            launch_at_sign_in: true,
            tray_notice_shown: false,
            image_background: DEFAULT_IMAGE_BACKGROUND.into(),
            transparency_checkerboard: DEFAULT_CHECKERBOARD.into(),
            canvas_margin: CANVAS_MARGIN.default,
            crop_margin: CROP_MARGIN.default,
            dark_background: DEFAULT_DARK_BACKGROUND.into(),
            outside_darkness: OUTSIDE_DARKNESS.default,
            show_outside_default: DEFAULT_SHOW_OUTSIDE,
            library_strip_collapsed: false,
        }
    }
}

/// A hand-edited `"toolStyles": 5` must not cost the user their hotkey: anything but an object is empty.
fn object_or_empty<'de, D>(d: D) -> Result<serde_json::Map<String, serde_json::Value>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    })
}

/// Loads the settings; a missing file gives the defaults. A file that exists but cannot be parsed
/// also gives the defaults, but is first copied to `settings.json.corrupt` (one copy, an older one is
/// overwritten) so the next save does not destroy the user's hotkey and other choices.
pub fn load(dir: &Path) -> Settings {
    let Ok(bytes) = fs::read(dir.join(FILE_NAME)) else { return Settings::default() };
    match serde_json::from_slice(&bytes) {
        Ok(mut settings) => {
            resolve_demo_hotkey_clashes(&mut settings);
            settings
        }
        Err(parse_error) => {
            let outcome = match fs::write(dir.join(CORRUPT_FILE_NAME), &bytes) {
                Ok(()) => format!("a copy was kept as {CORRUPT_FILE_NAME}"),
                Err(e) => format!("could not keep a copy as {CORRUPT_FILE_NAME}: {e}"),
            };
            crate::diag::log(&format!("settings.json could not be read ({parse_error}); using defaults; {outcome}"));
            Settings::default()
        }
    }
}

/// Writes `bytes` to `path` and flushes them to disk before returning, so a rename that follows
/// cannot leave an empty or partial file after a power cut.
fn write_durably(path: &Path, bytes: &[u8]) -> io::Result<()> {
    use std::io::Write;
    let mut file = fs::File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

/// Saves the settings atomically (temp file flushed to disk, then rename).
pub fn save(dir: &Path, settings: &Settings) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    write_durably(&tmp, &serde_json::to_vec_pretty(settings)?)?;
    fs::rename(&tmp, dir.join(FILE_NAME))
}

/// Sets the magnifier value and then tries to save. The in-memory value changes even when the
/// write fails (the overlay keeps working this run); the error is returned for the caller to log.
pub fn set_magnifier(dir: &Path, settings: &mut Settings, enabled: bool) -> io::Result<()> {
    settings.magnifier = enabled;
    save(dir, settings)
}

/// Replaces the stored tool styles and then tries to save; like `set_magnifier`, the in-memory value
/// changes even when the write fails.
pub fn set_tool_styles(
    dir: &Path,
    settings: &mut Settings,
    styles: serde_json::Map<String, serde_json::Value>,
) -> io::Result<()> {
    settings.tool_styles = styles;
    save(dir, settings)
}

/// Replaces the stored shortcut overrides and then tries to save; like `set_tool_styles`, the
/// in-memory value changes even when the write fails.
pub fn set_shortcuts(
    dir: &Path,
    settings: &mut Settings,
    shortcuts: serde_json::Map<String, serde_json::Value>,
) -> io::Result<()> {
    settings.shortcuts = shortcuts;
    save(dir, settings)
}

/// Sets "launch at sign-in" and then tries to save; like `set_magnifier`, the in-memory value changes
/// even when the write fails.
pub fn set_launch_at_sign_in(dir: &Path, settings: &mut Settings, enabled: bool) -> io::Result<()> {
    settings.launch_at_sign_in = enabled;
    save(dir, settings)
}

fn invalid_choice(what: &str, value: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, format!("{value:?} is not a {what}"))
}

/// Sets the default background for new images and then tries to save; like `set_magnifier`, the in-memory
/// value changes even when the write fails. A value that is not one of `BACKGROUNDS` changes nothing.
pub fn set_image_background(dir: &Path, settings: &mut Settings, background: &str) -> io::Result<()> {
    if !BACKGROUNDS.contains(&background) {
        return Err(invalid_choice("background", background));
    }
    settings.image_background = background.to_string();
    save(dir, settings)
}

/// Sets the transparency checkerboard and then tries to save; same rules as `set_image_background`.
pub fn set_transparency_checkerboard(dir: &Path, settings: &mut Settings, theme: &str) -> io::Result<()> {
    if !CHECKERBOARDS.contains(&theme) {
        return Err(invalid_choice("checkerboard", theme));
    }
    settings.transparency_checkerboard = theme.to_string();
    save(dir, settings)
}

fn out_of_range(what: &str, value: u32, range: Range) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, format!("{value} is not a {what} ({} to {})", range.min, range.max))
}

/// Sets the canvas margin in pixels; a value outside `CANVAS_MARGIN` changes nothing.
pub fn set_canvas_margin(dir: &Path, settings: &mut Settings, value: u32) -> io::Result<()> {
    if !CANVAS_MARGIN.contains(value) {
        return Err(out_of_range("canvas margin", value, CANVAS_MARGIN));
    }
    settings.canvas_margin = value;
    save(dir, settings)
}

/// Sets the canvas margin used while the Crop tool is active; a value outside `CROP_MARGIN` changes nothing.
pub fn set_crop_margin(dir: &Path, settings: &mut Settings, value: u32) -> io::Result<()> {
    if !CROP_MARGIN.contains(value) {
        return Err(out_of_range("crop margin", value, CROP_MARGIN));
    }
    settings.crop_margin = value;
    save(dir, settings)
}

/// Sets the colour of the Dark image background; anything but `#RRGGBB` changes nothing. Stored lower-case.
pub fn set_dark_background(dir: &Path, settings: &mut Settings, color: &str) -> io::Result<()> {
    if !is_hex_color(color) {
        return Err(invalid_choice("colour (#RRGGBB)", color));
    }
    settings.dark_background = color.to_ascii_lowercase();
    save(dir, settings)
}

/// Sets the outside-canvas darkness in percent; a value outside `OUTSIDE_DARKNESS`, or with more than one decimal, changes nothing.
pub fn set_outside_darkness(dir: &Path, settings: &mut Settings, value: f64) -> io::Result<()> {
    if !OUTSIDE_DARKNESS.contains(value) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("{value} is not an outside darkness ({} to {}, to a tenth)", OUTSIDE_DARKNESS.min, OUTSIDE_DARKNESS.max),
        ));
    }
    settings.outside_darkness = value;
    save(dir, settings)
}

/// Sets how the pointer highlight looks and then tries to save; like `set_magnifier`, the in-memory value
/// changes even when the write fails. A colour that is not `#RRGGBB` or a size that is not one of
/// `POINTER_SIZES` changes nothing.
pub fn set_pointer(dir: &Path, settings: &mut Settings, new: &PointerSettings) -> io::Result<()> {
    if !is_hex_color(&new.color) {
        return Err(invalid_choice("colour (#RRGGBB)", &new.color));
    }
    if !POINTER_SIZES.contains(&new.size.as_str()) {
        return Err(invalid_choice("pointer size", &new.size));
    }
    settings.pointer_color = new.color.to_ascii_lowercase();
    settings.pointer_size = new.size.clone();
    settings.pointer_ripple = new.ripple;
    save(dir, settings)
}

/// Sets whether the pointer highlight hides the system mouse arrow and then tries to save (in-memory value kept
/// when the write fails, like `set_magnifier`).
pub fn set_pointer_hide_cursor(dir: &Path, settings: &mut Settings, hide: bool) -> io::Result<()> {
    settings.pointer_hide_cursor = hide;
    save(dir, settings)
}

/// Sets Drawing mode's Highlighter opacity in percent; a value outside `DRAWING_HIGHLIGHTER_OPACITY` changes nothing.
pub fn set_drawing_highlighter_opacity(dir: &Path, settings: &mut Settings, percent: u32) -> io::Result<()> {
    if !DRAWING_HIGHLIGHTER_OPACITY.contains(percent) {
        return Err(out_of_range("Drawing mode Highlighter opacity", percent, DRAWING_HIGHLIGHTER_OPACITY));
    }
    settings.drawing_highlighter_opacity = percent;
    save(dir, settings)
}

/// Sets whether new images show the area outside the canvas.
pub fn set_show_outside_default(dir: &Path, settings: &mut Settings, show: bool) -> io::Result<()> {
    settings.show_outside_default = show;
    save(dir, settings)
}

/// Sets whether the Library Strip is collapsed to a thin bar.
pub fn set_library_strip_collapsed(dir: &Path, settings: &mut Settings, collapsed: bool) -> io::Result<()> {
    settings.library_strip_collapsed = collapsed;
    save(dir, settings)
}

/// Forgets every sticky tool style (and the per-tool choices stored beside them) and tries to save.
pub fn reset_tool_styles(dir: &Path, settings: &mut Settings) -> io::Result<()> {
    settings.tool_styles = serde_json::Map::new();
    save(dir, settings)
}

/// True exactly once: the first time the editor is closed to the tray. Records that the notice was
/// shown (in memory at once, then on disk; a failed write only means it may be shown once more after a restart).
pub fn take_tray_notice(dir: &Path, settings: &mut Settings) -> bool {
    if settings.tray_notice_shown {
        return false;
    }
    settings.tray_notice_shown = true;
    let _ = save(dir, settings);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("sa-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn the_demo_hotkeys_default_for_a_fresh_install_and_for_files_from_before_they_existed() {
        let s = load(&temp_dir("demo-fresh"));
        assert_eq!((s.pointer_highlight_hotkey.as_str(), s.drawing_mode_hotkey.as_str()), ("ctrl+shift+l", "ctrl+shift+d"));
        let dir = temp_dir("demo-old-file");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        let s = load(&dir);
        assert_eq!(s.hotkey, "alt+x");
        assert_eq!((s.pointer_highlight_hotkey.as_str(), s.drawing_mode_hotkey.as_str()), ("ctrl+shift+l", "ctrl+shift+d"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_demo_hotkeys_round_trip_through_the_file() {
        let dir = temp_dir("demo-round-trip");
        let s = Settings {
            pointer_highlight_hotkey: "ctrl+alt+p".into(),
            drawing_mode_hotkey: "ctrl+alt+o".into(),
            ..Settings::default()
        };
        save(&dir, &s).unwrap();
        let back = load(&dir);
        assert_eq!(back.pointer_highlight_hotkey, "ctrl+alt+p");
        assert_eq!(back.drawing_mode_hotkey, "ctrl+alt+o");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn an_unusable_demo_hotkey_falls_back_to_its_default_and_keeps_the_rest() {
        let dir = temp_dir("demo-invalid");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","pointerHighlightHotkey":5,"drawingModeHotkey":"PrintScreen"}"#).unwrap();
        let s = load(&dir);
        assert_eq!(s.hotkey, "alt+x");
        assert_eq!(s.pointer_highlight_hotkey, "ctrl+shift+l");
        assert_eq!(s.drawing_mode_hotkey, "ctrl+shift+d");
        fs::write(dir.join(FILE_NAME), br#"{"pointerHighlightHotkey":"","drawingModeHotkey":"ctrl+PrintScreen"}"#).unwrap();
        let s = load(&dir);
        assert_eq!((s.pointer_highlight_hotkey.as_str(), s.drawing_mode_hotkey.as_str()), ("ctrl+shift+l", "ctrl+shift+d"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_demo_hotkey_that_clashes_with_the_capture_or_the_other_demo_hotkey_falls_back() {
        let dir = temp_dir("demo-clash");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"ctrl+alt+p","pointerHighlightHotkey":"ctrl+alt+p","drawingModeHotkey":"ctrl+alt+o"}"#).unwrap();
        let s = load(&dir);
        assert_eq!(s.pointer_highlight_hotkey, "ctrl+shift+l");
        assert_eq!(s.drawing_mode_hotkey, "ctrl+alt+o");
        fs::write(dir.join(FILE_NAME), br#"{"pointerHighlightHotkey":"ctrl+alt+o","drawingModeHotkey":"ctrl+alt+o"}"#).unwrap();
        let s = load(&dir);
        assert_eq!(s.pointer_highlight_hotkey, "ctrl+shift+l");
        assert_eq!(s.drawing_mode_hotkey, "ctrl+alt+o");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_file_gives_defaults() {
        let s = load(&temp_dir("missing"));
        assert_eq!(s.hotkey, "ctrl+shift+s");
        assert!(!s.print_screen_notice_dismissed);
    }

    #[test]
    fn saved_settings_load_back_and_leave_no_temp_file() {
        let dir = temp_dir("roundtrip");
        let s = Settings {
            hotkey: "PrintScreen".into(),
            print_screen_notice_dismissed: true,
            magnifier: false,
            ..Settings::default()
        };
        save(&dir, &s).unwrap();
        assert_eq!(load(&dir), s);
        assert!(!dir.join("settings.json.tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_corrupt_file_gives_defaults_instead_of_failing_startup() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), b"{ not json").unwrap();
        assert_eq!(load(&dir), Settings::default());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_corrupt_file_is_kept_aside_as_settings_json_corrupt_and_defaults_load() {
        let dir = temp_dir("corrupt-aside");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x", oops"#).unwrap();
        assert_eq!(load(&dir), Settings::default());
        assert_eq!(fs::read(dir.join(CORRUPT_FILE_NAME)).unwrap(), br#"{"hotkey":"alt+x", oops"#);
        // A later save overwrites settings.json, but the copy survives.
        save(&dir, &Settings::default()).unwrap();
        assert_eq!(fs::read(dir.join(CORRUPT_FILE_NAME)).unwrap(), br#"{"hotkey":"alt+x", oops"#);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_one_corrupt_copy_is_kept_the_newest() {
        let dir = temp_dir("corrupt-newest");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), b"first {").unwrap();
        load(&dir);
        fs::write(dir.join(FILE_NAME), b"second {").unwrap();
        load(&dir);
        assert_eq!(fs::read(dir.join(CORRUPT_FILE_NAME)).unwrap(), b"second {");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_normal_or_missing_file_is_not_copied_aside() {
        let dir = temp_dir("no-copy");
        load(&dir);
        assert!(!dir.join(CORRUPT_FILE_NAME).exists());
        save(&dir, &Settings::default()).unwrap();
        load(&dir);
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","toolStyles":5}"#).unwrap();
        load(&dir);
        assert!(!dir.join(CORRUPT_FILE_NAME).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn write_durably_writes_the_bytes_and_replaces_an_older_file() {
        let dir = temp_dir("durable");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.tmp");
        write_durably(&path, b"old old old").unwrap();
        write_durably(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_file_missing_newer_fields_keeps_what_it_has() {
        let dir = temp_dir("partial");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        let s = load(&dir);
        assert_eq!(s.hotkey, "alt+x");
        assert!(!s.print_screen_notice_dismissed);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_magnifier_is_on_for_a_fresh_install_and_for_files_from_before_it_existed() {
        assert!(load(&temp_dir("fresh-magnifier")).magnifier);
        let dir = temp_dir("old-file");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","printScreenNoticeDismissed":true}"#).unwrap();
        let s = load(&dir);
        assert!(s.magnifier);
        assert_eq!((s.hotkey.as_str(), s.print_screen_notice_dismissed), ("alt+x", true));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_magnifier_is_stored_as_camel_case_magnifier_and_round_trips_both_ways() {
        let dir = temp_dir("magnifier-roundtrip");
        for value in [false, true] {
            let s = Settings { magnifier: value, ..Settings::default() };
            save(&dir, &s).unwrap();
            let text = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
            assert!(text.contains(&format!("\"magnifier\": {value}")), "{text}");
            assert_eq!(load(&dir).magnifier, value);
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn set_magnifier_saves_the_new_value() {
        let dir = temp_dir("set-magnifier");
        let mut s = Settings::default();
        assert!(set_magnifier(&dir, &mut s, false).is_ok());
        assert!(!s.magnifier);
        assert!(!load(&dir).magnifier);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn set_magnifier_keeps_the_value_in_memory_when_the_file_cannot_be_written() {
        // The "folder" is a regular file, so creating the folder and the temp file both fail.
        let blocker = temp_dir("blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(set_magnifier(&blocker, &mut s, false).is_err());
        assert!(!s.magnifier, "the overlay keeps working with the value for this run");
        fs::remove_file(&blocker).unwrap();
    }

    fn styles(json: &str) -> serde_json::Map<String, serde_json::Value> {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn files_from_before_tool_styles_existed_load_with_none_and_keep_their_other_fields() {
        let dir = temp_dir("old-no-styles");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","magnifier":false}"#).unwrap();
        let s = load(&dir);
        assert!(s.tool_styles.is_empty());
        assert_eq!((s.hotkey.as_str(), s.magnifier), ("alt+x", false));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn tool_styles_are_stored_as_camel_case_toolstyles_and_round_trip_untouched() {
        let dir = temp_dir("styles-roundtrip");
        let mut s = Settings::default();
        let wanted = styles(r##"{"rect":{"stroke":{"color":"#2563eb","width":8},"fill":{"mode":"semi","color":"#facc15","opacity":0.4}}}"##);
        set_tool_styles(&dir, &mut s, wanted.clone()).unwrap();
        let text = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
        assert!(text.contains("\"toolStyles\""), "{text}");
        assert_eq!(load(&dir).tool_styles, wanted);
        // The other settings are written alongside, unchanged.
        assert_eq!(load(&dir).hotkey, DEFAULT_HOTKEY);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn shortcut_overrides_round_trip_and_a_non_object_costs_nothing_else() {
        let dir = temp_dir("shortcuts-roundtrip");
        let mut s = Settings::default();
        let wanted = styles(r#"{"overlay.magnifier":"N"}"#);
        set_shortcuts(&dir, &mut s, wanted.clone()).unwrap();
        assert!(fs::read_to_string(dir.join(FILE_NAME)).unwrap().contains("\"shortcuts\""));
        assert_eq!(load(&dir).shortcuts, wanted);
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","shortcuts":5}"#).unwrap();
        let s = load(&dir);
        assert!(s.shortcuts.is_empty());
        assert_eq!(s.hotkey, "alt+x");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_tool_styles_field_that_is_not_an_object_costs_nothing_else() {
        let dir = temp_dir("styles-wrong-type");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","toolStyles":5}"#).unwrap();
        let s = load(&dir);
        assert!(s.tool_styles.is_empty());
        assert_eq!(s.hotkey, "alt+x");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn set_tool_styles_keeps_the_value_in_memory_when_the_file_cannot_be_written() {
        let blocker = temp_dir("styles-blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(set_tool_styles(&blocker, &mut s, styles(r#"{"line":{}}"#)).is_err());
        assert!(s.tool_styles.contains_key("line"));
        fs::remove_file(&blocker).unwrap();
    }

    #[test]
    fn launch_at_sign_in_is_on_by_default_and_for_files_from_before_it_existed() {
        assert!(Settings::default().launch_at_sign_in);
        let dir = temp_dir("launch-old-file");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        assert!(load(&dir).launch_at_sign_in);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn turning_launch_at_sign_in_off_is_saved_and_leaves_the_rest_alone() {
        let dir = temp_dir("launch-off");
        let mut s = Settings { hotkey: "alt+x".into(), ..Settings::default() };
        set_launch_at_sign_in(&dir, &mut s, false).unwrap();
        let back = load(&dir);
        assert!(!back.launch_at_sign_in);
        assert_eq!(back.hotkey, "alt+x");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn launch_at_sign_in_keeps_the_new_value_in_memory_when_the_file_cannot_be_written() {
        let blocker = temp_dir("launch-blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(set_launch_at_sign_in(&blocker, &mut s, false).is_err());
        assert!(!s.launch_at_sign_in);
        fs::remove_file(&blocker).unwrap();
    }

    #[test]
    fn reset_tool_styles_clears_every_sticky_style_and_nothing_else() {
        let dir = temp_dir("reset-styles");
        let mut s = Settings { hotkey: "alt+x".into(), magnifier: false, ..Settings::default() };
        set_tool_styles(&dir, &mut s, styles(r#"{"rect":{"stroke":{"width":8}},"toolBehavior":{"pen":true}}"#)).unwrap();
        reset_tool_styles(&dir, &mut s).unwrap();
        let back = load(&dir);
        assert!(back.tool_styles.is_empty());
        assert_eq!(back.hotkey, "alt+x");
        assert!(!back.magnifier);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_tray_notice_is_taken_once_and_stays_taken_after_a_restart() {
        let dir = temp_dir("tray-notice");
        let mut s = Settings::default();
        assert!(!s.tray_notice_shown);
        assert!(take_tray_notice(&dir, &mut s));
        assert!(!take_tray_notice(&dir, &mut s));
        let mut after_restart = load(&dir);
        assert!(after_restart.tray_notice_shown);
        assert!(!take_tray_notice(&dir, &mut after_restart));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_tray_notice_that_could_not_be_recorded_is_not_repeated_in_the_same_run() {
        let blocker = temp_dir("tray-notice-blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(take_tray_notice(&blocker, &mut s));
        assert!(!take_tray_notice(&blocker, &mut s));
        fs::remove_file(&blocker).unwrap();
    }

    #[test]
    fn a_fresh_install_starts_transparent_with_the_light_checkerboard_and_the_view_defaults() {
        let s = load(&temp_dir("fresh-image"));
        assert_eq!((s.image_background.as_str(), s.transparency_checkerboard.as_str()), ("transparent", "light"));
        assert_eq!(
            s.image_settings(),
            ImageSettings {
                background: "transparent".into(),
                checkerboard: "light".into(),
                canvas_margin: 16,
                crop_margin: 150,
                dark_background: "#191919".into(),
                outside_darkness: 95.0,
                show_outside_default: true,
                library_strip_collapsed: false,
            }
        );
    }

    #[test]
    fn the_image_settings_reach_the_page_in_camel_case() {
        let json = serde_json::to_value(Settings::default().image_settings()).unwrap();
        assert_eq!(json["canvasMargin"], 16);
        assert_eq!(json["cropMargin"], 150);
        assert_eq!(json["darkBackground"], "#191919");
        assert_eq!(json["outsideDarkness"], 95.0);
        assert_eq!(json["showOutsideDefault"], true);
        assert_eq!(json["libraryStripCollapsed"], false);
    }

    #[test]
    fn a_stored_checkerboard_is_kept_and_a_missing_one_is_now_light() {
        let dir = temp_dir("old-checkerboard");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"transparencyCheckerboard":"dark"}"#).unwrap();
        assert_eq!(load(&dir).transparency_checkerboard, "dark");
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        assert_eq!(load(&dir).transparency_checkerboard, "light");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_numeric_settings_are_validated_on_set_and_clamped_or_defaulted_on_load() {
        let dir = temp_dir("numeric");
        let mut s = Settings::default();
        assert!(set_canvas_margin(&dir, &mut s, 201).is_err());
        set_canvas_margin(&dir, &mut s, 0).unwrap();
        set_canvas_margin(&dir, &mut s, 200).unwrap();
        assert!(set_crop_margin(&dir, &mut s, 401).is_err());
        assert_eq!(s.crop_margin, 150);
        set_crop_margin(&dir, &mut s, 0).unwrap();
        set_crop_margin(&dir, &mut s, 400).unwrap();
        assert!(set_outside_darkness(&dir, &mut s, 100.0).is_err());
        assert!(set_outside_darkness(&dir, &mut s, 50.55).is_err());
        assert!(set_outside_darkness(&dir, &mut s, f64::NAN).is_err());
        assert!(set_outside_darkness(&dir, &mut s, -0.1).is_err());
        assert_eq!(s.outside_darkness, 95.0);
        set_outside_darkness(&dir, &mut s, 99.9).unwrap();
        assert_eq!(s.outside_darkness, 99.9);
        set_outside_darkness(&dir, &mut s, 0.0).unwrap();
        set_show_outside_default(&dir, &mut s, false).unwrap();
        let back = load(&dir);
        assert_eq!((back.canvas_margin, back.outside_darkness, back.show_outside_default), (200, 0.0, false));
        assert_eq!(back.crop_margin, 400);
        let text = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
        assert!(text.contains("\"canvasMargin\": 200") && text.contains("\"showOutsideDefault\": false"), "{text}");

        fs::write(
            dir.join(FILE_NAME),
            br#"{"canvasMargin":3,"outsideDarkness":"x","showOutsideDefault":"no"}"#,
        )
        .unwrap();
        let back = load(&dir);
        assert_eq!((back.canvas_margin, back.outside_darkness, back.show_outside_default), (3, 95.0, true));
        fs::write(dir.join(FILE_NAME), br#"{"canvasMargin":1.5,"outsideDarkness":null}"#).unwrap();
        let back = load(&dir);
        assert_eq!((back.canvas_margin, back.outside_darkness), (16, 95.0));
        // A margin saved before the new default (48) stays as stored.
        fs::write(dir.join(FILE_NAME), br#"{"canvasMargin":48,"cropMargin":999}"#).unwrap();
        let back = load(&dir);
        assert_eq!((back.canvas_margin, back.crop_margin), (48, 400));
        fs::write(dir.join(FILE_NAME), br#"{"cropMargin":"x"}"#).unwrap();
        assert_eq!(load(&dir).crop_margin, 150);
        // A stored whole number stays as stored; a fraction is kept to a tenth; a value past the range is brought into it.
        for (stored, expected) in [("60", 60.0), ("72.5", 72.5), ("72.54", 72.5), ("99.9", 99.9), ("100", 99.9), ("-4", 0.0), ("0", 0.0)] {
            fs::write(dir.join(FILE_NAME), format!(r#"{{"outsideDarkness":{stored}}}"#)).unwrap();
            assert_eq!(load(&dir).outside_darkness, expected, "stored {stored}");
        }
        assert!(!dir.join(CORRUPT_FILE_NAME).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_dark_background_must_be_a_hex_colour_and_is_stored_lower_case() {
        let dir = temp_dir("dark-background");
        let mut s = Settings::default();
        for bad in ["", "191919", "#19191", "#1919199", "#gggggg", "red", "#12345é"] {
            assert!(set_dark_background(&dir, &mut s, bad).is_err(), "{bad}");
        }
        assert_eq!(s.dark_background, "#191919");
        set_dark_background(&dir, &mut s, "#AbCdEf").unwrap();
        assert_eq!(load(&dir).dark_background, "#abcdef");
        fs::write(dir.join(FILE_NAME), br##"{"darkBackground":"#102030"}"##).unwrap();
        assert_eq!(load(&dir).dark_background, "#102030");
        for (stored, expected) in [(r##""pink""##, "#191919"), ("5", "#191919"), ("null", "#191919"), (r##""#12345""##, "#191919"), (r##""#FFFFFF""##, "#ffffff")] {
            fs::write(dir.join(FILE_NAME), format!(r#"{{"darkBackground":{stored}}}"#)).unwrap();
            assert_eq!(load(&dir).dark_background, expected, "stored {stored}");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_library_strip_collapse_is_kept_between_launches_and_anything_but_true_is_expanded() {
        let dir = temp_dir("strip-collapsed");
        let mut s = Settings::default();
        assert!(!s.library_strip_collapsed);
        set_library_strip_collapsed(&dir, &mut s, true).unwrap();
        assert!(load(&dir).library_strip_collapsed);
        for (stored, expected) in [("true", true), ("false", false), ("1", false), (r#""yes""#, false), ("null", false)] {
            fs::write(dir.join(FILE_NAME), format!(r#"{{"libraryStripCollapsed":{stored}}}"#)).unwrap();
            assert_eq!(load(&dir).library_strip_collapsed, expected, "stored {stored}");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_file_from_before_the_image_settings_keeps_what_it_has_and_gets_the_defaults() {
        let dir = temp_dir("old-image");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        let s = load(&dir);
        assert_eq!(s.hotkey, "alt+x");
        assert_eq!((s.image_background.as_str(), s.transparency_checkerboard.as_str()), ("transparent", "light"));
        assert!(!dir.join(CORRUPT_FILE_NAME).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_image_settings_are_stored_camel_case_and_round_trip() {
        let dir = temp_dir("image-roundtrip");
        let mut s = Settings::default();
        set_image_background(&dir, &mut s, "white").unwrap();
        set_transparency_checkerboard(&dir, &mut s, "light").unwrap();
        let text = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
        assert!(text.contains("\"imageBackground\": \"white\""), "{text}");
        assert!(text.contains("\"transparencyCheckerboard\": \"light\""), "{text}");
        let back = load(&dir);
        assert_eq!((back.image_background.as_str(), back.transparency_checkerboard.as_str()), ("white", "light"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_value_that_is_not_a_choice_is_refused_and_a_stored_one_falls_back_to_the_default() {
        let dir = temp_dir("image-invalid");
        let mut s = Settings::default();
        assert!(set_image_background(&dir, &mut s, "pink").is_err());
        assert!(set_transparency_checkerboard(&dir, &mut s, "").is_err());
        assert_eq!(s.image_background, "transparent");
        assert_eq!(s.transparency_checkerboard, "light");

        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x","imageBackground":"pink","transparencyCheckerboard":5}"#).unwrap();
        let back = load(&dir);
        assert_eq!(back.hotkey, "alt+x");
        assert_eq!((back.image_background.as_str(), back.transparency_checkerboard.as_str()), ("transparent", "light"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn image_settings_keep_the_new_value_in_memory_when_the_file_cannot_be_written() {
        let blocker = temp_dir("image-blocked");
        fs::write(&blocker, b"not a folder").unwrap();
        let mut s = Settings::default();
        assert!(set_image_background(&blocker, &mut s, "dark").is_err());
        assert_eq!(s.image_background, "dark");
        assert!(set_transparency_checkerboard(&blocker, &mut s, "light").is_err());
        assert_eq!(s.transparency_checkerboard, "light");
        fs::remove_file(&blocker).unwrap();
    }

    #[test]
    fn the_pointer_highlight_defaults_to_a_red_medium_dot_with_the_ripple_on() {
        let s = load(&temp_dir("pointer-fresh"));
        assert_eq!(s.pointer_settings(), PointerSettings { color: "#e02424".into(), size: "medium".into(), ripple: true });
        // A file from before the pointer highlight existed.
        let dir = temp_dir("pointer-old-file");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        assert_eq!(load(&dir).pointer_settings(), Settings::default().pointer_settings());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_pointer_highlight_settings_round_trip_through_the_file() {
        let dir = temp_dir("pointer-round-trip");
        let mut s = Settings::default();
        let chosen = PointerSettings { color: "#2563EB".into(), size: "large".into(), ripple: false };
        set_pointer(&dir, &mut s, &chosen).unwrap();
        let back = load(&dir);
        assert_eq!(back.pointer_settings(), PointerSettings { color: "#2563eb".into(), size: "large".into(), ripple: false });
        let json = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
        assert!(json.contains("\"pointerColor\"") && json.contains("\"pointerSize\"") && json.contains("\"pointerRipple\""), "{json}");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_pointer_colour_or_size_that_is_not_allowed_changes_nothing() {
        let dir = temp_dir("pointer-refused");
        let mut s = Settings::default();
        let ok = Settings::default().pointer_settings();
        for color in ["", "e02424", "#e0242", "#gggggg", "red"] {
            let bad = PointerSettings { color: color.into(), ..ok.clone() };
            assert!(set_pointer(&dir, &mut s, &bad).is_err(), "{color}");
        }
        assert!(set_pointer(&dir, &mut s, &PointerSettings { size: "huge".into(), ..ok.clone() }).is_err());
        assert_eq!(s.pointer_settings(), ok);
    }

    #[test]
    fn unusable_stored_pointer_values_are_the_defaults() {
        let dir = temp_dir("pointer-hand-edited");
        fs::create_dir_all(&dir).unwrap();
        for (stored, color, size, ripple) in [
            (r##"{"pointerColor":"#ABCDEF","pointerSize":"small","pointerRipple":false}"##, "#abcdef", "small", false),
            (r##"{"pointerColor":"pink","pointerSize":"Huge","pointerRipple":"no"}"##, "#e02424", "medium", true),
            (r#"{"pointerColor":5,"pointerSize":null,"pointerRipple":null}"#, "#e02424", "medium", true),
        ] {
            fs::write(dir.join(FILE_NAME), stored).unwrap();
            let s = load(&dir);
            assert_eq!((s.pointer_color.as_str(), s.pointer_size.as_str(), s.pointer_ripple), (color, size, ripple), "{stored}");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_pointer_settings_reach_the_page_in_camel_case() {
        let json = serde_json::to_value(Settings::default().pointer_settings()).unwrap();
        assert_eq!(json, serde_json::json!({ "color": "#e02424", "size": "medium", "ripple": true }));
    }

    #[test]
    fn the_new_demo_settings_default_to_hiding_the_arrow_and_a_20_percent_highlighter() {
        let s = load(&temp_dir("demo-new-fresh"));
        assert!(s.pointer_hide_cursor);
        assert_eq!(s.drawing_highlighter_opacity, 20);
        // A file from before these settings existed.
        let dir = temp_dir("demo-new-old-file");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), br#"{"hotkey":"alt+x"}"#).unwrap();
        let old = load(&dir);
        assert!(old.pointer_hide_cursor);
        assert_eq!(old.drawing_highlighter_opacity, 20);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_new_demo_settings_round_trip_through_the_file() {
        let dir = temp_dir("demo-new-round-trip");
        let mut s = Settings::default();
        set_pointer_hide_cursor(&dir, &mut s, false).unwrap();
        set_drawing_highlighter_opacity(&dir, &mut s, 45).unwrap();
        let back = load(&dir);
        assert!(!back.pointer_hide_cursor);
        assert_eq!(back.drawing_highlighter_opacity, 45);
        let json = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
        assert!(json.contains("\"pointerHideCursor\"") && json.contains("\"drawingHighlighterOpacity\""), "{json}");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_highlighter_opacity_outside_5_to_60_is_refused_and_a_stored_one_is_brought_into_range() {
        let dir = temp_dir("demo-new-range");
        let mut s = Settings::default();
        for bad in [0, 4, 61, 100] {
            assert!(set_drawing_highlighter_opacity(&dir, &mut s, bad).is_err(), "{bad}");
        }
        assert_eq!(s.drawing_highlighter_opacity, 20);
        fs::create_dir_all(&dir).unwrap();
        for (stored, want) in [
            (r#"{"drawingHighlighterOpacity":1}"#, 5),
            (r#"{"drawingHighlighterOpacity":99}"#, 60),
            (r#"{"drawingHighlighterOpacity":35}"#, 35),
            (r#"{"drawingHighlighterOpacity":"30"}"#, 20),
            (r#"{"drawingHighlighterOpacity":null}"#, 20),
            (r#"{"drawingHighlighterOpacity":12.5}"#, 20),
        ] {
            fs::write(dir.join(FILE_NAME), stored).unwrap();
            assert_eq!(load(&dir).drawing_highlighter_opacity, want, "{stored}");
        }
        fs::write(dir.join(FILE_NAME), br#"{"pointerHideCursor":"yes"}"#).unwrap();
        assert!(load(&dir).pointer_hide_cursor);
        fs::write(dir.join(FILE_NAME), br#"{"pointerHideCursor":false}"#).unwrap();
        assert!(!load(&dir).pointer_hide_cursor);
        fs::remove_dir_all(&dir).unwrap();
    }
}
