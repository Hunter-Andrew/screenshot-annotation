import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The app's own colours (chrome, not Annotations) are defined once in theme.css. These tests read it as text, the
// way the browser would, and hold every foreground/background pair to WCAG AA.
const css = readFileSync(join(__dirname, "theme.css"), "utf8");

function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]!] = m[2]!.toLowerCase();
  return out;
}
const dark = /@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/.exec(css)![1]!;
const light = vars(css.replace(dark, ""));
const themes = { light, dark: { ...light, ...vars(dark) } };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum]: 4.5 for text, 3 for non-text (focus ring, selection outline).
const PAIRS: [string, string, number][] = [
  ["fg", "chrome", 4.5],
  ["fg", "bg", 4.5],
  ["muted", "chrome", 4.5],
  ["muted", "bg", 4.5],
  ["fg", "pressed", 4.5],
  ["fg", "pressed2", 4.5],
  ["accent-fg", "accent", 4.5],
  ["accent2-fg", "accent2", 4.5],
  ["accent2-text", "chrome", 4.5],
  ["accent2-text", "pressed2", 4.5],
  ["accent-text", "chrome", 4.5],
  ["accent-text", "pressed", 4.5],
  ["danger", "chrome", 4.5],
  ["warn", "chrome", 4.5],
  ["toast-fg", "toast-bg", 4.5],
  ["toast-accent", "toast-bg", 3],
  ["focus", "chrome", 3],
  ["focus", "bg", 3],
  ["accent2-edge", "chrome", 3],
  ["accent2-edge", "pressed2", 3],
];

describe.each(Object.entries(themes))("palette, %s theme", (_name, t) => {
  it.each(PAIRS)("%s on %s reaches %s:1", (fg, bg, min) => {
    expect(t[fg], `--${fg} defined`).toBeDefined();
    expect(t[bg], `--${bg} defined`).toBeDefined();
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(min);
  });
});

describe("the chosen palette (ticket 42, option 3)", () => {
  it("is purple-led with green second", () => {
    expect(themes.light.accent).toBe("#520df2");
    expect(themes.light.accent2).toBe("#25e8b7");
    expect(themes.light["accent2-text"]).toBe("#046a50");
    expect(themes.dark.accent).toBe("#6d32f5");
    expect(themes.dark.accent2).toBe("#25e8b7");
    expect(themes.dark["accent2-text"]).toBe("#25e8b7");
  });
});

describe("the old blue", () => {
  it("is gone from src", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|css)$/.test(f) && f !== "theme.test.ts" && /2f5bea|47,\s*91,\s*234/i.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk(join(__dirname, ".."));
    expect(hits).toEqual([]);
  });
});
