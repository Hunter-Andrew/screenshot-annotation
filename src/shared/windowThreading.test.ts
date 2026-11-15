// @vitest-environment node
//
// Ticket 36. Tauri documents that creating a window (WebviewWindowBuilder::build) from a
// synchronous command, or from an event handler, deadlocks on Windows: a sync command runs on the
// main thread inside WebView2's own message callback, and window creation pumps messages there and
// never returns (wry issue 583). The app froze with a blank, unclosable Settings window.
//
// This reads the Rust sources as text (like rustParity.test.ts) and fails if a `#[tauri::command]`
// that creates a window, directly or through the helpers it calls, is a plain `fn`. A function that
// hands its window work to `std::thread::spawn` is safe to call from anywhere, so the search does
// not look through it.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../src-tauri/src");

interface RustFn {
  name: string;
  isCommand: boolean;
  isAsync: boolean;
  body: string;
}

/** Blanks out comments and string literals so braces and names inside them are not read as code. */
function stripNoise(source: string): string {
  return source
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function parseFns(source: string): RustFn[] {
  const code = stripNoise(source);
  const fns: RustFn[] = [];
  const header = /((?:#\[[^\]]*\]\s*)*)(?:pub(?:\([^)]*\))?\s+)?(async\s+)?fn\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = header.exec(code))) {
    const open = code.indexOf("{", header.lastIndex);
    const semi = code.indexOf(";", header.lastIndex);
    if (open === -1 || (semi !== -1 && semi < open)) continue; // a declaration without a body
    let depth = 0;
    let i = open;
    for (; i < code.length; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}" && --depth === 0) break;
    }
    fns.push({
      name: m[3],
      isCommand: /#\[tauri::command/.test(m[1]),
      isAsync: Boolean(m[2]),
      body: code.slice(open, i + 1),
    });
  }
  return fns;
}

const SEEDS = ["show_settings", "show_editor", "new_window", "WebviewWindowBuilder"];

const calls = (body: string, name: string) => new RegExp(`(?<![.\\w])${name}\\s*(?:::<[^>]*>)?\\s*\\(|(?<![.\\w])${name}::new\\b`).test(body);
const spawnsThread = (body: string) => /thread::spawn|thread::Builder|async_runtime::spawn/.test(body);

/** Names of the functions that can create a window on the calling thread. */
function windowCreators(fns: RustFn[]): Set<string> {
  const creators = new Set<string>(SEEDS);
  for (let changed = true; changed; ) {
    changed = false;
    for (const fn of fns) {
      if (creators.has(fn.name) || spawnsThread(fn.body)) continue;
      if ([...creators].some((name) => calls(fn.body, name))) {
        creators.add(fn.name);
        changed = true;
      }
    }
  }
  return creators;
}

/** Commands that create windows but are plain `fn`s, so would run on the main thread. */
function syncWindowCommands(sources: string[]): string[] {
  const fns = sources.flatMap(parseFns);
  const creators = windowCreators(fns);
  return fns
    .filter((fn) => fn.isCommand && !fn.isAsync && !spawnsThread(fn.body))
    .filter((fn) => [...creators].some((name) => calls(fn.body, name)))
    .map((fn) => fn.name);
}

describe("window creation never runs on the main thread from a command", () => {
  it("flags a sync command that calls show_settings (the Settings freeze)", () => {
    const source = `
      fn show_settings(app: &AppHandle) { let _ = new_window(app, "settings", url).build(); }
      #[tauri::command]
      fn open_settings(app: AppHandle) { show_settings(&app); }
    `;
    expect(syncWindowCommands([source])).toEqual(["open_settings"]);
  });

  it("flags a sync command that reaches a window through a helper", () => {
    const source = `
      fn show_editor(app: &AppHandle) { WebviewWindowBuilder::new(app, "editor", url); }
      fn deliver_capture(app: &AppHandle) { show_editor(app); }
      fn fail(app: &AppHandle) { deliver_capture(app); }
      #[tauri::command]
      pub fn overlay_log(app: AppHandle) { fail(&app); }
    `;
    expect(syncWindowCommands([source])).toEqual(["overlay_log"]);
  });

  it("accepts async commands, and sync ones that only hand the work to a spawned thread", () => {
    const source = `
      fn show_settings(app: &AppHandle) { new_window(app, "settings", url); }
      fn request_settings(app: &AppHandle) { let app = app.clone(); std::thread::spawn(move || show_settings(&app)); }
      #[tauri::command]
      async fn open_settings(app: AppHandle) { show_settings(&app); }
      #[tauri::command]
      fn start_capture(app: AppHandle) { request_settings(&app); }
    `;
    expect(syncWindowCommands([source])).toEqual([]);
  });

  it("ignores names in comments, strings and method calls", () => {
    const source = `
      fn show_editor(app: &AppHandle) { new_window(app, "editor", url); }
      #[tauri::command]
      fn app_version(app: AppHandle) -> String { // show_editor(&app);
        let s = "show_editor(x)"; app.x.show_editor(); s.into() }
    `;
    expect(syncWindowCommands([source])).toEqual([]);
  });

  it("holds for every #[tauri::command] in src-tauri/src", () => {
    const files = readdirSync(SRC).filter((f) => f.endsWith(".rs"));
    const sources = files.map((f) => readFileSync(resolve(SRC, f), "utf8"));
    expect(files).toContain("lib.rs");
    expect(syncWindowCommands(sources)).toEqual([]);
  });

  it("the Settings gear command exists, is registered, and is async", () => {
    const lib = readFileSync(resolve(SRC, "lib.rs"), "utf8");
    expect(lib).toMatch(/#\[tauri::command\]\s*async fn open_settings\(/);
    expect(lib).toMatch(/\bopen_settings,/);
  });
});
