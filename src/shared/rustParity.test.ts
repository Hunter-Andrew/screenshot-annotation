// @vitest-environment node
//
// Constants that must be spelled identically in the TS frontend and the Rust backend.
// The TS side is the single source of truth; a drift on the Rust side fails here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OVERLAY_HASH_PREFIX, RELEASES_URL, SETTINGS_HASH } from "./constants";

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

  it("the overlay capability glob covers the overlay window labels", () => {
    const label = rust("overlay.rs").match(/const LABEL_PREFIX: &str = "([^"]+)";/)?.[1];
    const capability = readFileSync(resolve(__dirname, "../../src-tauri/capabilities/default.json"), "utf8");
    expect(JSON.parse(capability).windows).toContain(`${label}*`);
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
});
