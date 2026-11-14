// @vitest-environment node
//
// Constants that must be spelled identically in the TS frontend and the Rust backend.
// The TS side is the single source of truth; a drift on the Rust side fails here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASES_URL, SETTINGS_HASH } from "./constants";

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
});
