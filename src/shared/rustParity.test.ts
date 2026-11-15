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
});
