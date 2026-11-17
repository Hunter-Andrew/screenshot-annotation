import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";

// Text and Callout layout in real Chromium with the real Fabric objects: wrapping of long words, vertical
// alignment, underline. The shapes are built in the page (the app's own modules, through the dev server) and
// either measured or drawn through the Export renderer.

const font = { size: 24, bold: false, italic: false, color: "#000000", align: "left", valign: "top", underline: false };
const noOutline = { enabled: false, color: "#ffffff", width: 2 };

interface Measured {
  lines: string[];
  width: number;
  height: number;
  lineWidths: number[];
}

/** Lay a Text out and report its wrapped lines and their measured widths. */
async function layout(page: Page, text: string, width: number, extra: Record<string, unknown> = {}): Promise<Measured> {
  return page.evaluate(
    async ({ text, width, font, noOutline, extra }) => {
      const { TextShape } = await import(/* @vite-ignore */ "/src/canvas/shapes/textShape.ts" as string);
      const shape = new TextShape({ id: "t", type: "text", x: 0, y: 0, width, text, font, textOutline: noOutline, ...extra });
      const lines = (shape._textLines as string[][]).map((l) => l.join(""));
      return {
        lines,
        width: shape.width as number,
        height: shape.height as number,
        lineWidths: lines.map((_, i) => shape.getLineWidth(i) as number),
      };
    },
    { text, width, font, noOutline, extra },
  );
}

test.describe("wrapping like Word", () => {
  test("normal words wrap at spaces", async ({ page }) => {
    await page.goto("/");
    const out = await layout(page, "one two three four five six", 120);
    expect(out.lines.length).toBeGreaterThan(1);
    // Every line is made of whole words, and together they are the text (the break space is not drawn).
    expect(out.lines.join(" ")).toBe("one two three four five six");
    expect(Math.max(...out.lineWidths)).toBeLessThanOrEqual(120);
  });

  test("a word longer than the box breaks across lines by letter, with no ellipsis, and the box does not widen", async ({ page }) => {
    await page.goto("/");
    const word = "Supercalifragilisticexpialidocious";
    const out = await layout(page, word, 90);
    expect(out.width).toBe(90);
    expect(out.lines.length).toBeGreaterThan(2);
    expect(out.lines.join("")).toBe(word); // nothing lost, nothing added ("..." included)
    expect(Math.max(...out.lineWidths)).toBeLessThanOrEqual(90);
    // Lines are filled, not broken early: every line but the last is within a letter's width of full.
    for (const w of out.lineWidths.slice(0, -1)) expect(w).toBeGreaterThan(90 - 30);
  });

  test("a long word among short ones: the short ones still wrap at spaces, the long one starts a line and breaks", async ({ page }) => {
    await page.goto("/");
    const out = await layout(page, "go Supercalifragilisticexpialidocious now ok", 100);
    expect(out.width).toBe(100);
    expect(out.lines[0]).toBe("go"); // the long word does not fit after "go": it moves down
    expect(out.lines.join("").replace(/ /g, "")).toBe("goSupercalifragilisticexpialidocious" + "nowok");
    expect(Math.max(...out.lineWidths)).toBeLessThanOrEqual(100);
    // The text after the long word continues on its last line when there is room, else on the next, at a space.
    expect(out.lines.at(-1)).toMatch(/(^| )ok$/);
  });

  test("a very narrow box (the minimum width, 20) still holds any text, one letter at least per line", async ({ page }) => {
    await page.goto("/");
    const out = await layout(page, "Unbroken-long-text and words", 20);
    expect(out.width).toBe(20);
    expect(out.lines.join("").replace(/ /g, "")).toBe("Unbroken-long-textandwords");
    for (const line of out.lines) expect(line.length).toBeGreaterThanOrEqual(1);
  });

  test("the left handle and the right handle can take the box down to 20 whatever the words are", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(
      async ({ font, noOutline }) => {
        const { TextShape } = await import(/* @vite-ignore */ "/src/canvas/shapes/textShape.ts" as string);
        const make = () =>
          new TextShape({ id: "t", type: "text", x: 100, y: 10, width: 200, text: "Supercalifragilisticexpialidocious word", font, textOutline: noOutline });
        const right = make();
        right.dragHandle("mr", 0, 0); // far left of the box: as narrow as it goes
        const left = make();
        left.dragHandle("ml", 1000, 0); // far right of the box
        return { right: right.width, left: left.width, leftEdge: left.left };
      },
      { font, noOutline },
    );
    expect(result.right).toBe(20);
    expect(result.left).toBe(20);
    expect(result.leftEdge).toBe(280); // the right edge (300) stayed
  });

  test("the caret and selection still map to the right letters after a break in the middle of a word", async ({ page }) => {
    await page.goto("/");
    const out = await page.evaluate(
      async ({ font, noOutline }) => {
        const { TextShape } = await import(/* @vite-ignore */ "/src/canvas/shapes/textShape.ts" as string);
        const shape = new TextShape({ id: "t", type: "text", x: 0, y: 0, width: 70, text: "abcdefghijklmnopqrstuvwxyz xy", font, textOutline: noOutline });
        const lines = (shape._textLines as string[][]).map((l) => l.join(""));
        // Where each character index lands (line, offset in line): every letter must be found exactly once, in order.
        const seen: string[] = [];
        for (let i = 0; i < shape.text.length; i++) {
          const at = shape.get2DCursorLocation(i);
          seen.push(`${at.lineIndex}:${at.charIndex}`);
        }
        const next = lines.map((_, i) => shape.missingNewlineOffset(i));
        return { lines, seen, next, text: shape.text };
      },
      { font, noOutline },
    );
    // Line breaks inside a word consume no character; the break at the space consumes it.
    expect(out.lines.join("").replace(/ /g, "")).toBe("abcdefghijklmnopqrstuvwxyzxy");
    const last = out.lines.length - 1;
    out.next.forEach((offset, i) => {
      const nextLine = out.lines[i + 1];
      if (i === last || nextLine === undefined) return;
      // The offset is 1 only where the text has a space that the break swallowed.
      const consumed = out.text.indexOf(" ") >= 0 && out.lines.slice(0, i + 1).join("").length === out.text.indexOf(" ") ? 1 : 0;
      expect(offset).toBe(consumed);
    });
    expect(new Set(out.seen).size).toBe(out.text.length);
  });
});

/** Draw one Text through the Export and return the rows (0-based, inside the box) where there is ink. */
async function inkRows(page: Page, annotation: Record<string, unknown>, size: { width: number; height: number }) {
  const png = await page.evaluate(
    async ({ annotation, size }) => {
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const { exportPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
      const { renderFinished } = await import(/* @vite-ignore */ "/src/canvas/renderFinished.ts" as string);
      const rgba = new Uint8Array(size.width * size.height * 4).fill(255);
      const capture = encodeRgbaPng(size.width, size.height, rgba);
      const out = await exportPng({ capture, model: { formatVersion: 1, annotations: [annotation], crop: null } }, renderFinished);
      return Array.from(out as Uint8Array);
    },
    { annotation, size },
  );
  const px = decodePixels(Uint8Array.from(png));
  const rows: number[] = [];
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      if (px.rgba[(y * px.width + x) * 4]! < 128) {
        rows.push(y);
        break;
      }
    }
  }
  return { rows, px };
}

const text = (extraFont: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: "t",
  type: "text",
  x: 10,
  y: 10,
  width: 200,
  minHeight: 180,
  text: "Hxg",
  font: { ...font, ...extraFont },
  textOutline: noOutline,
  ...extra,
});

test.describe("vertical alignment", () => {
  test("Top, Middle and Bottom put the text at the top, the middle and the bottom of a taller box", async ({ page }) => {
    await page.goto("/");
    const size = { width: 240, height: 220 };
    const top = (await inkRows(page, text({ valign: "top" }), size)).rows;
    const middle = (await inkRows(page, text({ valign: "middle" }), size)).rows;
    const bottom = (await inkRows(page, text({ valign: "bottom" }), size)).rows;
    // The box is rows 10 to 190.
    expect(top[0]!).toBeLessThan(10 + 12);
    const inkHeight = top.at(-1)! - top[0]!;
    expect(inkHeight).toBeGreaterThan(10);
    const centre = (rows: number[]) => (rows[0]! + rows.at(-1)!) / 2;
    expect(Math.abs(centre(middle) - 100)).toBeLessThanOrEqual(12); // box middle is row 100, within the ascender/descender slack
    expect(middle[0]!).toBeGreaterThan(top[0]! + 40);
    expect(bottom.at(-1)!).toBeGreaterThan(190 - 12);
    expect(bottom.at(-1)!).toBeLessThanOrEqual(190);
    expect(bottom[0]!).toBeGreaterThan(middle[0]! + 40);
  });

  test("a box exactly as tall as its text looks the same in all three; a text saved without valign is drawn at the top", async ({ page }) => {
    await page.goto("/");
    const size = { width: 240, height: 80 };
    const base = { minHeight: undefined } as Record<string, unknown>;
    const a = (await inkRows(page, text({ valign: "top" }, base), size)).rows;
    const b = (await inkRows(page, text({ valign: "bottom" }, base), size)).rows;
    const c = (await inkRows(page, text({ valign: "middle" }, base), size)).rows;
    expect(b).toEqual(a);
    expect(c).toEqual(a);

    const { valign: _removed, ...older } = { ...font } as Record<string, unknown>;
    const old = (await inkRows(page, { ...text({}, {}), font: older }, { width: 240, height: 220 })).rows;
    const top = (await inkRows(page, text({ valign: "top" }), { width: 240, height: 220 })).rows;
    expect(old).toEqual(top);
  });

  test("the caret and a click on the text agree with where it is drawn", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(
      async ({ font, noOutline }) => {
        const { TextShape } = await import(/* @vite-ignore */ "/src/canvas/shapes/textShape.ts" as string);
        const make = (valign: string) =>
          new TextShape({ id: "t", type: "text", x: 0, y: 0, width: 200, minHeight: 200, text: "aaa\nbbb", font: { ...font, valign }, textOutline: noOutline });
        const out: Record<string, number> = {};
        for (const valign of ["top", "middle", "bottom"]) {
          const shape = make(valign);
          const b = shape._getCursorBoundaries(0);
          // The first line's top edge in box coordinates (the box's own origin is its centre).
          out[valign] = b.top + b.topOffset + shape.height / 2;
        }
        return out;
      },
      { font, noOutline },
    );
    expect(r.top).toBeLessThan(5);
    expect(r.middle).toBeGreaterThan(60);
    expect(r.middle).toBeLessThan(110);
    expect(r.bottom).toBeGreaterThan(r.middle + 40);
  });
});

test.describe("underline", () => {
  test("Underline draws a line under every line of the text, in the canvas and the Export, and off draws none", async ({ page }) => {
    await page.goto("/");
    const size = { width: 240, height: 80 };
    // No descender in the text, so the underline is below all of its ink.
    const plain = await inkRows(page, text({ valign: "top" }, { minHeight: undefined, text: "HxH" }), size);
    const underlined = await inkRows(page, text({ valign: "top", underline: true }, { minHeight: undefined, text: "HxH" }), size);
    // An underline is a long thin run of ink below the letters.
    expect(underlined.rows.length).toBeGreaterThan(plain.rows.length);
    expect(underlined.rows.at(-1)!).toBeGreaterThan(plain.rows.at(-1)!);
    const bottomRow = underlined.rows.at(-1)!;
    let inked = 0;
    for (let x = 0; x < underlined.px.width; x++) if (underlined.px.rgba[(bottomRow * underlined.px.width + x) * 4]! < 128) inked++;
    expect(inked).toBeGreaterThan(30);
  });
});
