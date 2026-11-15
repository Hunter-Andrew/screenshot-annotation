// @vitest-environment node
//
// The app icon is generated from one master file (`npm run icons`, see README "App icon"). These
// checks catch a bad replacement of `assets/icon-source.png` or a half-regenerated icon set, and a
// new window that bypasses the helper that gives every window the logo.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path));
const USED = ["32x32.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.ico"];
const ICO_SIZES = [16, 24, 32, 48, 64, 256];

interface Png {
  width: number;
  height: number;
  alpha: Uint8Array;
}

/** Minimal decoder for the 8-bit RGBA PNGs `tauri icon` writes: returns the size and the alpha plane. */
function decodePng(buf: Buffer): Png {
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9], data[12]], "must be 8-bit RGBA, not interlaced").toEqual([8, 6, 0]);
    } else if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      px[y * stride + x] = (v + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
  return { width, height, alpha };
}

function hasRealAlpha(png: Png): boolean {
  return png.alpha.includes(0) && png.alpha.includes(255);
}

function icoSizes(buf: Buffer): number[] {
  expect(buf.readUInt16LE(0)).toBe(0);
  expect(buf.readUInt16LE(2)).toBe(1);
  return Array.from({ length: buf.readUInt16LE(4) }, (_, i) => buf[6 + i * 16] || 256).sort((a, b) => a - b);
}

describe("master icon assets/icon-source.png", () => {
  const source = decodePng(read("assets/icon-source.png"));

  it("is square and at least 512 px", () => {
    expect(source.width).toBe(source.height);
    expect(source.width).toBeGreaterThanOrEqual(512);
  });

  it("has a transparent background (some fully transparent and some opaque pixels)", () => {
    expect(hasRealAlpha(source)).toBe(true);
  });
});

describe("generated icon set in src-tauri/icons", () => {
  it.each(USED)("%s exists", (file) => {
    expect(existsSync(resolve(root, "src-tauri/icons", file))).toBe(true);
  });

  it.each([
    ["32x32.png", 32],
    ["128x128.png", 128],
    ["128x128@2x.png", 256],
    ["icon.png", 512],
  ])("%s is %i px square with real alpha", (file, size) => {
    const png = decodePng(read(`src-tauri/icons/${file}`));
    expect([png.width, png.height]).toEqual([size, size]);
    expect(hasRealAlpha(png)).toBe(true);
  });

  it("icon.ico holds the 16, 24, 32, 48, 64 and 256 px sizes (taskbar, Alt+Tab, shortcut, installer)", () => {
    expect(icoSizes(read("src-tauri/icons/icon.ico"))).toEqual(expect.arrayContaining(ICO_SIZES));
  });

  it("holds only the files the app uses (regenerate with `npm run icons`, which copies just these)", () => {
    expect(readdirSync(resolve(root, "src-tauri/icons")).sort()).toEqual([...USED].sort());
  });

  it("tauri.conf.json bundles exactly these files, including icon.ico for the exe and installer", () => {
    const conf = JSON.parse(read("src-tauri/tauri.conf.json").toString());
    expect([...conf.bundle.icon].sort()).toEqual(USED.filter((f) => f !== "icon.png").map((f) => `icons/${f}`).sort());
  });
});

describe("every window gets the logo", () => {
  it("only the new_window helper creates windows, and it sets the default window icon", () => {
    const sources = readdirSync(resolve(root, "src-tauri/src")).filter((f) => f.endsWith(".rs"));
    const uses = sources.flatMap((f) => (read(`src-tauri/src/${f}`).toString().match(/WebviewWindowBuilder::new\(/g) ?? []).map(() => f));
    expect(uses).toEqual(["lib.rs"]);
    const helper = read("src-tauri/src/lib.rs").toString().match(/pub\(crate\) fn new_window[\s\S]*?\n}\n/)?.[0] ?? "";
    expect(helper).toContain("WebviewWindowBuilder::new(");
    expect(helper).toContain("default_window_icon()");
    expect(helper).toContain(".icon(");
  });
});
