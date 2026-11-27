import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";

// Styled text (per-selection font styling) on the real Fabric shapes in real Chromium: how the model's runs are
// drawn, how the box's height follows a larger run, that Export draws the same, and that the shape hands the runs
// back to the model. The shapes are built in the page from the app's own modules, through the dev server.

const font = { size: 24, bold: false, italic: false, color: "#000000", align: "left", valign: "top", underline: false };
const noOutline = { enabled: false, color: "#ffffff", width: 2 };
const box = (extra: Record<string, unknown> = {}, extraFont: Record<string, unknown> = {}) => ({
  id: "t",
  type: "text",
  x: 10,
  y: 10,
  width: 300,
  text: "Hello World",
  font: { ...font, ...extraFont },
  textOutline: noOutline,
  ...extra,
});

/** Build a shape in the page and report what `read` returns about it. */
async function shapeInfo(page: Page, annotation: Record<string, unknown>, kind: "text" | "callout" = "text") {
  return page.evaluate(
    async ({ annotation, kind }) => {
      const mod = kind === "text" ? await import(/* @vite-ignore */ "/src/canvas/shapes/textShape.ts" as string) : await import(/* @vite-ignore */ "/src/canvas/shapes/calloutShape.ts" as string);
      const shape = kind === "text" ? new mod.TextShape(annotation) : new mod.CalloutShape(annotation);
      const model = kind === "text" ? shape.toModel() : shape.toCallout();
      return { styles: shape.styles, height: shape.height as number, model };
    },
    { annotation, kind },
  );
}

test.describe("runs on the real shape", () => {
  test("a run styles only its characters, in Fabric's own per-character styles", async ({ page }) => {
    await page.goto("/");
    const info = await shapeInfo(page, box({ runs: [{ from: 6, to: 11, font: { bold: true, color: "#00aa00" } }] }));
    expect(info.styles).toEqual({
      0: Object.fromEntries([6, 7, 8, 9, 10].map((i) => [i, { fontWeight: "bold", fill: "#00aa00" }])),
    });
  });

  test("the shape hands its runs back to the model, in the model's form; a box with none stores none", async ({ page }) => {
    await page.goto("/");
    const runs = [
      { from: 0, to: 5, font: { size: 40 } },
      { from: 6, to: 11, font: { italic: true, underline: true } },
    ];
    const styled = await shapeInfo(page, box({ runs }));
    expect(styled.model.runs).toEqual(runs);
    const plain = await shapeInfo(page, box());
    expect("runs" in plain.model).toBe(false);
  });

  test("a style equal to the box's own is not a run", async ({ page }) => {
    await page.goto("/");
    const info = await shapeInfo(page, box({ runs: [{ from: 0, to: 5, font: { size: 24, bold: false } }] }));
    expect("runs" in info.model).toBe(false);
  });

  test("a Callout shows and hands back runs the same way", async ({ page }) => {
    await page.goto("/");
    const callout = {
      ...box(),
      type: "callout",
      stroke: { color: "#000000", width: 2 },
      fill: { mode: "none", color: "#ffffff", opacity: 1 },
      runs: [{ from: 0, to: 5, font: { bold: true } }],
    };
    const info = await shapeInfo(page, callout, "callout");
    expect(info.model.runs).toEqual([{ from: 0, to: 5, font: { bold: true } }]);
    expect(info.styles).toEqual({ 0: Object.fromEntries([0, 1, 2, 3, 4].map((i) => [i, { fontWeight: "bold" }])) });
  });

  test("a larger run makes its line taller, and the box follows; the minimum height still applies", async ({ page }) => {
    await page.goto("/");
    const two = "Hello\nWorld";
    const plain = await shapeInfo(page, box({ text: two }));
    const big = await shapeInfo(page, box({ text: two, runs: [{ from: 6, to: 11, font: { size: 60 } }] }));
    const small = await shapeInfo(page, box({ text: two, runs: [{ from: 6, to: 11, font: { size: 10 } }] }));
    expect(big.height).toBeGreaterThan(plain.height + 30);
    expect(small.height).toBeLessThan(plain.height - 8);
    const tall = await shapeInfo(page, box({ text: two, minHeight: 400, runs: [{ from: 6, to: 11, font: { size: 60 } }] }));
    expect(tall.height).toBe(400);
  });

  test("a run that is malformed or past the text is ignored, the text is still drawn", async ({ page }) => {
    await page.goto("/");
    const info = await shapeInfo(page, box({ runs: [{ from: 50, to: 60, font: { bold: true } }, { nonsense: 1 }, "x"] }));
    expect(info.styles).toEqual({});
    expect(info.model.text).toBe("Hello World");
  });
});

/** The Export of one box on a white 360 x 120 Capture, as pixels. */
async function exported(page: Page, annotation: Record<string, unknown>) {
  const png = await page.evaluate(
    async ({ annotation }) => {
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const { exportPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
      const { renderFinished } = await import(/* @vite-ignore */ "/src/canvas/renderFinished.ts" as string);
      const capture = encodeRgbaPng(360, 120, new Uint8Array(360 * 120 * 4).fill(255));
      const out = await exportPng({ capture, model: { formatVersion: 1, annotations: [annotation], crop: null } }, renderFinished);
      return Array.from(out as Uint8Array);
    },
    { annotation },
  );
  return decodePixels(Uint8Array.from(png));
}

const count = (px: { width: number; height: number; rgba: number[] }, test: (r: number, g: number, b: number) => boolean) => {
  let n = 0;
  for (let i = 0; i < px.rgba.length; i += 4) if (test(px.rgba[i]!, px.rgba[i + 1]!, px.rgba[i + 2]!)) n++;
  return n;
};
const isGreen = (r: number, g: number, b: number) => g > 120 && r < 90 && b < 90;
const isDark = (r: number, g: number, b: number) => r < 90 && g < 90 && b < 90;

test.describe("Export draws styled text", () => {
  test("a colored run is drawn in its color, and only there", async ({ page }) => {
    await page.goto("/");
    const plain = await exported(page, box({ text: "HHHH HHHH" }));
    expect(count(plain, isGreen)).toBe(0);
    const styled = await exported(page, box({ text: "HHHH HHHH", runs: [{ from: 5, to: 9, font: { color: "#00aa00" } }] }));
    expect(count(styled, isGreen)).toBeGreaterThan(100);
    expect(count(styled, isDark)).toBeGreaterThan(100); // the first word is still the box's black
    // Greens are all to the right of the first word's blacks.
    let rightmostDark = 0;
    let leftmostGreen = styled.width;
    for (let y = 0; y < styled.height; y++)
      for (let x = 0; x < styled.width; x++) {
        const i = (y * styled.width + x) * 4;
        if (isDark(styled.rgba[i]!, styled.rgba[i + 1]!, styled.rgba[i + 2]!)) rightmostDark = Math.max(rightmostDark, x);
        if (isGreen(styled.rgba[i]!, styled.rgba[i + 1]!, styled.rgba[i + 2]!)) leftmostGreen = Math.min(leftmostGreen, x);
      }
    expect(leftmostGreen).toBeGreaterThan(rightmostDark);
  });

  test("a bold run is wider and a bigger run is taller than the same letters plain", async ({ page }) => {
    await page.goto("/");
    const ink = (px: { width: number; height: number; rgba: number[] }) => {
      let minX = px.width;
      let maxX = 0;
      let minY = px.height;
      let maxY = 0;
      for (let y = 0; y < px.height; y++)
        for (let x = 0; x < px.width; x++) {
          const i = (y * px.width + x) * 4;
          if (px.rgba[i]! < 128) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      return { width: maxX - minX, height: maxY - minY };
    };
    const plain = ink(await exported(page, box({ text: "HHHH" })));
    const bold = ink(await exported(page, box({ text: "HHHH", runs: [{ from: 0, to: 4, font: { bold: true } }] })));
    const big = ink(await exported(page, box({ text: "HHHH", runs: [{ from: 0, to: 4, font: { size: 48 } }] })));
    expect(bold.width).toBeGreaterThan(plain.width);
    expect(big.height).toBeGreaterThan(plain.height * 1.6);
  });
});
