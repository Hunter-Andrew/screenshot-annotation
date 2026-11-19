// @vitest-environment node
//
// Constants that must be spelled identically in the TS frontend and the Rust backend.
// The TS side is the single source of truth; a drift on the Rust side fails here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKGROUNDS } from "../core/area";
import { CAPTURE_DELAYS } from "../platform/bridge";
import { CANVAS_MARGIN, CHECKERBOARD_THEMES, CROP_MARGIN, DEFAULT_DARK_BACKGROUND, DEFAULT_IMAGE_SETTINGS, OUTSIDE_DARKNESS } from "./imageSettings";
import { COUNTDOWN_HASH, DRAWING_HASH_PREFIX, OVERLAY_HASH_PREFIX, POINTER_HIGHLIGHT_HASH, RELEASES_URL, SETTINGS_HASH } from "./constants";
import { DEFAULT_POINTER_SETTINGS, POINTER_SIZES } from "../platform/bridge";
import { POINTER_WINDOW_SIZE } from "../pointer/pointerStyle";

const rust = (file: string) => readFileSync(resolve(__dirname, "../../src-tauri/src", file), "utf8");

describe("TS/Rust shared constants", () => {
  it("url_guard.rs allows exactly the Releases URL the Settings page opens", () => {
    const match = rust("url_guard.rs").match(/pub const RELEASES_URL: &str = "([^"]+)";/);
    expect(match?.[1]).toBe(RELEASES_URL);
  });

  it("lib.rs opens the Settings window at the same hash App.tsx routes on", () => {
    const match = rust("lib.rs").match(/WebviewUrl::App\("index\.html([^"]*)"/);
    expect(match?.[1]).toBe(SETTINGS_HASH);
  });

  it("overlay.rs opens each overlay window at the prefix App.tsx routes on", () => {
    const match = rust("overlay.rs").match(/WebviewUrl::App\(format!\("index\.html([^"{]*)\{/);
    expect(match?.[1]).toBe(OVERLAY_HASH_PREFIX);
  });

  it("drawing.rs opens each Drawing mode overlay window at the prefix App.tsx routes on", () => {
    const match = rust("drawing.rs").match(/WebviewUrl::App\(format!\("index\.html([^"{]*)\{/);
    expect(match?.[1]).toBe(DRAWING_HASH_PREFIX);
  });

  it("the capability glob covers the Drawing mode overlay window labels", () => {
    const label = rust("drawing_plan.rs").match(/pub const LABEL_PREFIX: &str = "([^"]+)";/)?.[1];
    const capability = readFileSync(resolve(__dirname, "../../src-tauri/capabilities/default.json"), "utf8");
    expect(label).toBeTruthy();
    expect(JSON.parse(capability).windows).toContain(`${label}*`);
  });

  it("countdown.rs opens the countdown badge window at the hash App.tsx routes on", () => {
    const match = rust("countdown.rs").match(/WebviewUrl::App\("index\.html([^"]*)"/);
    expect(match?.[1]).toBe(COUNTDOWN_HASH);
  });

  it("delay.rs offers the same delays as the editor's top bar", () => {
    const match = rust("delay.rs").match(/pub const CHOICES: \[u32; \d+\] = \[([^\]]*)\];/);
    expect(match?.[1].split(",").map((n) => Number(n.trim()))).toEqual([...CAPTURE_DELAYS]);
  });

  it("settings.rs offers the same image backgrounds and checkerboards, with the same defaults, as the editor", () => {
    const list = (name: string) => rust("settings.rs").match(new RegExp(`pub const ${name}: \\[&str; \\d+\\] = \\[([^\\]]*)\\];`))?.[1].split(",").map((v) => v.trim().replace(/"/g, ""));
    const text = (name: string) => rust("settings.rs").match(new RegExp(`pub const ${name}: &str = "([^"]+)";`))?.[1];
    expect(list("BACKGROUNDS")).toEqual([...BACKGROUNDS]);
    expect(list("CHECKERBOARDS")).toEqual([...CHECKERBOARD_THEMES]);
    expect(text("DEFAULT_IMAGE_BACKGROUND")).toBe(DEFAULT_IMAGE_SETTINGS.background);
    expect(text("DEFAULT_CHECKERBOARD")).toBe(DEFAULT_IMAGE_SETTINGS.checkerboard);
  });

  it("settings.rs has the same ranges and defaults for the numeric and boolean image settings as the editor", () => {
    const text = (name: string) => rust("settings.rs").match(new RegExp(`pub const ${name}: &str = "([^"]+)";`))?.[1];
    const range = (name: string) => {
      const m = rust("settings.rs").match(new RegExp(`pub const ${name}: Range = Range \\{ min: (\\d+), max: (\\d+), default: (\\d+) \\};`));
      return m && { min: Number(m[1]), max: Number(m[2]), default: Number(m[3]) };
    };
    // The outside darkness keeps a tenth of a percent: Rust spells it as a `DecimalRange` of f64.
    const decimalRange = (name: string) => {
      const m = rust("settings.rs").match(new RegExp(`pub const ${name}: DecimalRange = DecimalRange \\{ min: ([\\d.]+), max: ([\\d.]+), default: ([\\d.]+) \\};`));
      return m && { min: Number(m[1]), max: Number(m[2]), default: Number(m[3]), decimals: 1 };
    };
    expect(range("CANVAS_MARGIN")).toEqual(CANVAS_MARGIN);
    expect(range("CROP_MARGIN")).toEqual(CROP_MARGIN);
    expect(text("DEFAULT_DARK_BACKGROUND")).toBe(DEFAULT_DARK_BACKGROUND);
    expect(decimalRange("OUTSIDE_DARKNESS")).toEqual(OUTSIDE_DARKNESS);
    expect(rust("settings.rs").match(/pub const DEFAULT_SHOW_OUTSIDE: bool = (\w+);/)?.[1]).toBe(String(DEFAULT_IMAGE_SETTINGS.showOutsideDefault));
  });

  it("the bridge's image-setting commands exist in lib.rs, are registered, and use the argument names Rust expects", () => {
    const tauriBridge = readFileSync(resolve(__dirname, "../platform/tauriBridge.ts"), "utf8");
    const lib = rust("lib.rs");
    const expected: Record<string, string> = {
      set_canvas_margin: "pixels: u32",
      set_crop_margin: "pixels: u32",
      set_library_strip_collapsed: "collapsed: bool",
      set_dark_background: "color: String",
      set_outside_darkness: "percent: f64",
      set_show_outside_default: "show: bool",
    };
    for (const [command, arg] of Object.entries(expected)) {
      const name = arg.split(":")[0];
      expect(tauriBridge).toContain(`invoke<void>("${command}", { ${name} })`);
      expect(lib).toContain(`fn ${command}(app: AppHandle, state: tauri::State<'_, AppSettings>, ${arg})`);
      expect(lib).toMatch(new RegExp(`\\b${command},?\\s`));
    }
  });

  it("every command the Tauri bridge invokes is registered in lib.rs", () => {
    const tauriBridge = readFileSync(resolve(__dirname, "../platform/tauriBridge.ts"), "utf8");
    const commands = [...tauriBridge.matchAll(/invoke<[^>]*>\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(commands.length).toBeGreaterThan(30);
    const handlers = rust("lib.rs").match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? "";
    const registered = handlers.split(",").map((h) => h.trim().replace(/^\w+::/, "")).filter(Boolean);
    expect(commands.filter((c) => !registered.includes(c))).toEqual([]);
  });

  it("the overlay capability glob covers the overlay window labels", () => {
    const label = rust("overlay.rs").match(/const LABEL_PREFIX: &str = "([^"]+)";/)?.[1];
    const capability = readFileSync(resolve(__dirname, "../../src-tauri/capabilities/default.json"), "utf8");
    expect(JSON.parse(capability).windows).toContain(`${label}*`);
  });

  it("the capability covers the countdown badge window, so its page may listen for the numbers", () => {
    const label = rust("countdown.rs").match(/pub const LABEL: &str = "([^"]+)";/)?.[1];
    const capability = readFileSync(resolve(__dirname, "../../src-tauri/capabilities/default.json"), "utf8");
    expect(label).toBeTruthy();
    expect(JSON.parse(capability).windows).toContain(label);
  });

  it("the events Rust emits are the ones the Tauri bridge listens for", () => {
    const tauriBridge = readFileSync(resolve(__dirname, "../platform/tauriBridge.ts"), "utf8");
    const emitted = [
      rust("overlay.rs").match(/ATTEMPT_EVENT: &str = "([^"]+)"/)?.[1],
      rust("countdown.rs").match(/pub const EVENT: &str = "([^"]+)"/)?.[1],
      rust("lib.rs").match(/TOOL_STYLES_RESET_EVENT: &str = "([^"]+)"/)?.[1],
      rust("lib.rs").match(/IMAGE_SETTINGS_EVENT: &str = "([^"]+)"/)?.[1],
    ];
    for (const name of emitted) {
      expect(name).toBeTruthy();
      expect(tauriBridge).toMatch(new RegExp(`listen(<[^>]*>)?\\("${name}"`));
    }
  });

  it("the CSP lets the page reach Tauri's IPC protocol (else every call degrades to postMessage and binary replies stop being ArrayBuffers)", () => {
    const conf = JSON.parse(readFileSync(resolve(__dirname, "../../src-tauri/tauri.conf.json"), "utf8"));
    const csp: string = conf.app.security.csp;
    const connect = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src")) ?? "";
    expect(connect.split(/\s+/)).toEqual(expect.arrayContaining(["ipc:", "http://ipc.localhost"]));
  });

  it("lib.rs registers overlay_log and lists show_settings above show_editor", () => {
    const lib = rust("lib.rs");
    expect(lib).toContain("overlay::overlay_log");
    expect(lib.indexOf("fn show_settings")).toBeLessThan(lib.indexOf("fn show_editor"));
  });

  it("every undo-history command the bridge invokes is registered in lib.rs", () => {
    const tauriBridge = readFileSync(resolve(__dirname, "../platform/tauriBridge.ts"), "utf8");
    const commands = [...tauriBridge.matchAll(/invoke<[^>]*>\("(history_[a-z_]+)"/g)].map((m) => m[1]);
    expect(commands.sort()).toEqual(["history_delete", "history_purge_before", "history_read", "history_write"]);
    const lib = rust("lib.rs");
    for (const command of commands) {
      expect(lib).toMatch(new RegExp(`fn ${command}\\(`));
      expect(lib).toMatch(new RegExp(`\\b${command},`));
    }
  });

  it("the history file key is 64 hex characters on both sides (SHA-256)", () => {
    expect(rust("history_store.rs")).toMatch(/key\.len\(\) == 64/);
  });

  it("the bridge invokes the Rust command that opens the keyboard setting, and lib.rs registers it", () => {
    const tauriBridge = readFileSync(resolve(__dirname, "../platform/tauriBridge.ts"), "utf8");
    const command = tauriBridge.match(/openKeyboardSettings: \(\) => invoke<void>\("([^"]+)"\)/)?.[1];
    expect(command).toBe("open_keyboard_settings");
    const lib = rust("lib.rs");
    expect(lib).toMatch(new RegExp(`fn ${command}\\(`));
    expect(lib).toMatch(new RegExp(`\\b${command},`));
  });

  it("the bridge's tool-style commands exist in lib.rs and are registered, with the argument name Rust expects", () => {
    const tauriBridge = readFileSync(resolve(__dirname, "../platform/tauriBridge.ts"), "utf8");
    const lib = rust("lib.rs");
    expect(tauriBridge).toContain('invoke<Record<string, unknown>>("get_tool_styles")');
    expect(tauriBridge).toContain('invoke<void>("set_tool_styles", { styles })');
    for (const command of ["get_tool_styles", "set_tool_styles"]) {
      expect(lib).toMatch(new RegExp(`fn ${command}\\(`));
      expect(lib).toMatch(new RegExp(`\\b${command},`));
    }
    expect(lib).toMatch(/fn set_tool_styles\([^)]*\bstyles: /);
  });

  it("pointer_highlight.rs opens the dot window at the hash App.tsx routes on, and the capability covers its label", () => {
    const match = rust("pointer_highlight.rs").match(/WebviewUrl::App\("index\.html([^"]*)"/);
    expect(match?.[1]).toBe(POINTER_HIGHLIGHT_HASH);
    const label = rust("pointer_highlight.rs").match(/pub const LABEL: &str = "([^"]+)";/)?.[1];
    const capability = readFileSync(resolve(__dirname, "../../src-tauri/capabilities/default.json"), "utf8");
    expect(JSON.parse(capability).windows).toContain(label);
  });

  it("pointer.rs sizes the dot window like the page lays it out", () => {
    expect(Number(rust("pointer.rs").match(/pub const WINDOW_SIZE: u32 = (\d+);/)?.[1])).toBe(POINTER_WINDOW_SIZE);
  });

  it("settings.rs offers the same pointer sizes, colour and defaults as Settings > Demo tools", () => {
    const sizes = rust("settings.rs").match(/pub const POINTER_SIZES: \[&str; \d+\] = \[([^\]]*)\];/)?.[1].split(",").map((v) => v.trim().replace(/"/g, ""));
    expect(sizes).toEqual([...POINTER_SIZES]);
    const text = (name: string) => rust("settings.rs").match(new RegExp(`pub const ${name}: &str = "([^"]+)";`))?.[1];
    expect(text("DEFAULT_POINTER_SIZE")).toBe(DEFAULT_POINTER_SETTINGS.size);
    expect(text("DEFAULT_POINTER_COLOR")).toBe(DEFAULT_POINTER_SETTINGS.color);
    expect(rust("settings.rs")).toMatch(/pointer_ripple: true,/);
    expect(DEFAULT_POINTER_SETTINGS.ripple).toBe(true);
  });

  it("the pointer highlight events Rust emits are the ones the Tauri bridge listens for", () => {
    const tauriBridge = readFileSync(resolve(__dirname, "../platform/tauriBridge.ts"), "utf8");
    for (const constant of ["STATE_EVENT", "VIEW_EVENT", "RIPPLE_EVENT"]) {
      const name = rust("pointer_highlight.rs").match(new RegExp(`pub const ${constant}: &str = "([^"]+)"`))?.[1];
      expect(name).toBeTruthy();
      expect(tauriBridge).toMatch(new RegExp(`listen(<[^>]*>)?\\("${name}"`));
    }
  });

  it("the pointer highlight commands the bridge invokes use the argument names Rust expects", () => {
    const tauriBridge = readFileSync(resolve(__dirname, "../platform/tauriBridge.ts"), "utf8");
    const lib = rust("lib.rs");
    expect(tauriBridge).toContain('invoke<void>("set_pointer_settings", { pointer: settings })');
    expect(lib).toMatch(/fn set_pointer_settings\([^)]*\bpointer: settings::PointerSettings/);
    expect(tauriBridge).toContain('invoke<void>("set_pointer_highlight", { on })');
    expect(lib).toMatch(/fn set_pointer_highlight\(app: AppHandle, on: bool\)/);
  });
});
