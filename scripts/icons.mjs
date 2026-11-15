// `npm run icons`: regenerate src-tauri/icons from assets/icon-source.png.
//
// Runs `tauri icon` into a temp folder (it writes ~50 files for every platform), copies only the
// files the app uses into src-tauri/icons, and removes the temp folder. Replace the source file,
// run this, commit.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USED = ["32x32.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.ico"];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "icon-source.png");
const target = join(root, "src-tauri", "icons");

if (!existsSync(source)) {
  console.error(`Missing ${source}. Put the square 1024 px transparent PNG there.`);
  process.exit(1);
}

const temp = mkdtempSync(join(tmpdir(), "app-icons-"));
try {
  const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const run = spawnSync(process.execPath, [tauriCli, "icon", source, "-o", temp], { stdio: "inherit", cwd: root });
  if (run.status !== 0) {
    console.error("`tauri icon` failed; src-tauri/icons was left unchanged.");
    process.exit(run.status ?? 1);
  }
  const missing = USED.filter((file) => !readdirSync(temp).includes(file));
  if (missing.length > 0) {
    console.error(`\`tauri icon\` did not produce: ${missing.join(", ")}. src-tauri/icons was left unchanged.`);
    process.exit(1);
  }
  mkdirSync(target, { recursive: true });
  for (const file of USED) copyFileSync(join(temp, file), join(target, file));
  console.log(`Updated ${USED.join(", ")} in src-tauri/icons. Review and commit.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
