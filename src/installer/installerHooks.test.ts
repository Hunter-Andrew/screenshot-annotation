// @vitest-environment node
//
// Lints the NSIS installer config and hook file for the upgrade/uninstall behavior of
// ticket 03. NSIS cannot run on the Linux dev box, so this checks the source text only;
// the real behavior is covered by docs/release-checklist.md, and the Windows CI build
// compiles the hooks with makensis.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tauriDir = resolve(__dirname, "../../src-tauri");
const config = JSON.parse(readFileSync(resolve(tauriDir, "tauri.conf.json"), "utf8"));
const nsis = config.bundle.windows.nsis;

/** The hook file with full-line `;` and `#` comments stripped, so prose cannot satisfy or trip a rule. */
function hooks(): string {
  const text = readFileSync(resolve(tauriDir, nsis.installerHooks), "utf8");
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[;#].*$/, ""))
    .join("\n");
}

function macroBody(name: string): string {
  const match = hooks().match(new RegExp(`!macro ${name}\\b([\\s\\S]*?)!macroend`));
  expect(match, `${name} macro is defined`).not.toBeNull();
  return match![1];
}

describe("NSIS installer config", () => {
  it("installs per user and loads the hook file", () => {
    expect(nsis.installMode).toBe("currentUser");
    expect(typeof nsis.installerHooks).toBe("string");
    expect(hooks().length).toBeGreaterThan(0);
  });

  it("uses the bundle identifier that app data directories are named after", () => {
    expect(config.identifier).toBe("io.github.hunter-andrew.screenshot-annotation");
  });
});

describe("upgrade", () => {
  it("closes the running app before installing, without prompting", () => {
    const body = macroBody("NSIS_HOOK_PREINSTALL");
    expect(body).toMatch(/taskkill[^\n]*\/IM[^\n]*\$\{MAINBINARYNAME\}\.exe/);
    expect(body).not.toMatch(/MessageBox/);
  });

  it("closes the running app before an uninstall too (the old uninstaller runs on upgrade)", () => {
    expect(macroBody("NSIS_HOOK_PREUNINSTALL")).toMatch(/taskkill[^\n]*\/IM[^\n]*\$\{MAINBINARYNAME\}\.exe/);
  });

  it("relaunches the app after installing as the current user", () => {
    expect(macroBody("NSIS_HOOK_POSTINSTALL")).toMatch(
      /nsis_tauri_utils::RunAsUser\s+"\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe"/,
    );
  });

  it("does not relaunch twice when the finish page or /R already does", () => {
    const body = macroBody("NSIS_HOOK_POSTINSTALL");
    expect(body).toMatch(/\$\{Silent\}|\$PassiveMode/);
    expect(body).toMatch(/\$\{GetOptions\} \$CMDLINE "\/R"/);
  });
});

describe("data safety", () => {
  it("never touches the Library or any user folder", () => {
    expect(hooks()).not.toMatch(/\$PICTURES|\$MYPICTURES|\$DOCUMENTS|\$PROFILE|\$DESKTOP|Screenshot Annotation\\/i);
  });

  it("deletes nothing itself, leaving app-data removal to Tauri's checkbox-gated uninstaller", () => {
    // Tauri's template removes $APPDATA\<id> and $LOCALAPPDATA\<id> only when the
    // "Delete the application data" checkbox is ticked and it is not an update.
    expect(hooks()).not.toMatch(/\b(RMDir|Delete|DeleteRegKey|DeleteRegValue)\b/i);
  });

  it("does not hook the post-uninstall step", () => {
    expect(hooks()).not.toMatch(/!macro NSIS_HOOK_POSTUNINSTALL/);
  });
});
