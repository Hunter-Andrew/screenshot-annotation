import { expect, type Page, test } from "@playwright/test";
import { decodePixels } from "../src/core/testing";

// Line, Rectangle and Ellipse in real Chromium with the real Fabric canvas and the fake platform
// bridge (ticket 10). The model is read back the way the next app start reads it: by decoding the
// Library PNG the editor auto-saved; the Export is checked pixel by pixel.

interface Stroke {
  color: string;
  width: number;
}
interface Fill {
  mode: "none" | "solid" | "semi";
  color: string;
  opacity: number;
}
interface Shape {
  id: string;
  type: "line" | "rect" | "ellipse";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stroke: Stroke;
  fill?: Fill;
}
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
  toolStyles: Record<string, unknown>;
}
type InPage = { __fakeBridge: Bridge };

async function capture(page: Page, width: number, height: number) {
  await page.evaluate(
    ({ width, height, stamp }) => {
      const rgba = new Uint8Array(width * height * 4).fill(200);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date(stamp) });
    },
    { width, height, stamp: Date.now() },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
}

async function savedShapes(page: Page): Promise<Shape[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}

async function mapper(page: Page, width: number) {
  const box = (await page.locator(".stage").boundingBox())!;
  const scale = box.width / width;
  return { scale, at: (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale }) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

const close = (a: number | undefined, b: number, tolerance = 3) => a !== undefined && Math.abs(a - b) <= tolerance;

async function expectSaved(page: Page, check: (shapes: Shape[]) => boolean, message: string) {
  await expect
    .poll(async () => check(await savedShapes(page)), { message, timeout: 6000, intervals: [200] })
    .toBe(true);
}

type Pixels = ReturnType<typeof decodePixels>;
const at = (p: Pixels, x: number, y: number) => {
  const i = (Math.floor(y) * p.width + Math.floor(x)) * 4;
  return Array.from(p.rgba.slice(i, i + 4));
};
/** Within one level per channel: canvas blending rounds, and the expected values are worked out by hand. */
const nearly = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(4);
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThanOrEqual(1));
};

async function copiedPixels(page: Page, index: number): Promise<Pixels> {
  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(index + 1);
  const png = Uint8Array.from(await page.evaluate((i) => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[i]!), index));
  return decodePixels(png);
}

test.describe("Rectangle, Ellipse and Line", () => {
  test.use({ viewport: { width: 760, height: 520 } });

  test("draw a rectangle, restyle it from the Style panel, reload, and it is still editable", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    const view = await mapper(page, 400);

    await page.keyboard.press("r");
    await expect(page.getByRole("button", { name: /^Rectangle/ })).toHaveAttribute("aria-pressed", "true");
    await drag(page, view.at(50, 50), view.at(250, 150));
    await expectSaved(
      page,
      ([r]) => r?.type === "rect" && close(r.x, 50) && close(r.y, 50) && close(r.width, 200) && close(r.height, 100),
      "the rectangle is saved where it was drawn",
    );
    expect((await savedShapes(page))[0]).toMatchObject({
      stroke: { color: "#e02424", width: 4 },
      fill: { mode: "none" },
    });
    // It is selected, with the Stroke and Fill groups showing.
    await expect(page.getByRole("region", { name: "Stroke" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Fill" })).toBeVisible();

    // Restyle it: color, thickness, solid fill and its color.
    await page.getByRole("button", { name: "Color #2563eb", exact: true }).click();
    await page.getByRole("button", { name: "Thickness 8" }).click();
    await page.getByRole("button", { name: "Solid" }).click();
    await page.getByRole("button", { name: "Fill color #16a34a" }).click();
    await expectSaved(
      page,
      ([r]) =>
        r?.stroke.color === "#2563eb" &&
        r.stroke.width === 8 &&
        r.fill?.mode === "solid" &&
        r.fill.color === "#16a34a" &&
        close(r.x, 50) &&
        close(r.width, 200),
      "the restyle is saved and the box is untouched",
    );

    // Semi-transparent with a lower opacity.
    await page.getByRole("button", { name: "Semi-transparent" }).click();
    await page.getByRole("slider", { name: "Fill opacity" }).fill("25");
    await expectSaved(page, ([r]) => r?.fill?.mode === "semi" && r.fill.opacity === 0.25, "opacity saved");

    // Reload: the image and its rectangle come back, and clicking its outline selects it with its style.
    await page.reload();
    await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
    await expect(page.locator(".canvas-container")).toHaveCount(1);
    const again = await mapper(page, 400);
    await page.mouse.click(again.at(150, 50).x, again.at(150, 50).y);
    await expect(page.getByRole("button", { name: "Semi-transparent" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Color #2563eb", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Thickness 8" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => (window as unknown as InPage).__fakeBridge.libraryFiles.length)).toBe(1);
  });

  test("a rectangle moves and resizes by its handles, and only its box changes", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    const view = await mapper(page, 400);
    await page.keyboard.press("r");
    await drag(page, view.at(50, 50), view.at(250, 150));
    await expectSaved(page, ([r]) => !!r, "drawn");

    // Move: drag the outline (the inside of an unfilled rectangle is not grabbed) 40 px right.
    await drag(page, view.at(100, 51), view.at(140, 51)); // away from the middle handle on that edge
    await expectSaved(page, ([r]) => close(r?.x, 90) && close(r?.y, 50) && close(r?.width, 200), "moved");

    // Resize: the bottom-right handle, 60 px right and 50 down.
    await drag(page, view.at(290, 150), view.at(350, 200));
    await expectSaved(
      page,
      ([r]) => close(r?.x, 90) && close(r?.y, 50) && close(r?.width, 260) && close(r?.height, 150),
      "resized from the corner",
    );
    expect((await savedShapes(page))[0]).toMatchObject({ stroke: { color: "#e02424", width: 4 } }); // not scaled
  });

  test("L draws a line, E an ellipse, and the line has no Fill group", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    const view = await mapper(page, 400);

    await page.keyboard.press("l");
    await expect(page.getByRole("button", { name: /^Line/ })).toHaveAttribute("aria-pressed", "true");
    await drag(page, view.at(40, 250), view.at(360, 250));
    await expectSaved(
      page,
      ([l]) => l?.type === "line" && close(l.x1, 40) && close(l.y1, 250) && close(l.x2, 360) && close(l.y2, 250),
      "line saved",
    );
    await expect(page.getByRole("region", { name: "Stroke" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Fill" })).toHaveCount(0);

    await page.keyboard.press("Escape");
    await page.keyboard.press("e");
    await expect(page.getByRole("button", { name: /^Ellipse/ })).toHaveAttribute("aria-pressed", "true");
    await drag(page, view.at(100, 40), view.at(300, 140));
    await expectSaved(
      page,
      (all) => all[1]?.type === "ellipse" && close(all[1].x, 100) && close(all[1].y, 40) && close(all[1].width, 200) && close(all[1].height, 100),
      "ellipse saved",
    );
    await expect(page.getByRole("region", { name: "Fill" })).toBeVisible();
  });

  test("each tool remembers its last style across a restart", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    await page.keyboard.press("r");
    await page.getByRole("button", { name: "Color #9333ea", exact: true }).click();
    await page.getByRole("button", { name: "Thickness 8" }).click();
    await page.getByRole("button", { name: "Semi-transparent" }).click();
    await page.keyboard.press("l");
    await page.getByRole("button", { name: "Thickness 2" }).click();
    await expect
      .poll(() => page.evaluate(() => JSON.stringify((window as unknown as InPage).__fakeBridge.toolStyles)), { timeout: 4000 })
      .toContain('"line"');

    await page.reload(); // the app restarts; the fake platform keeps its settings like settings.json
    await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
    await expect(page.locator(".canvas-container")).toHaveCount(1);
    const view = await mapper(page, 400);

    await page.keyboard.press("r");
    await expect(page.getByRole("button", { name: "Color #9333ea", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Semi-transparent" })).toHaveAttribute("aria-pressed", "true");
    await drag(page, view.at(60, 60), view.at(200, 160));
    await expectSaved(
      page,
      (all) => {
        const rect = all.find((s) => s.type === "rect");
        return rect?.stroke.color === "#9333ea" && rect.stroke.width === 8 && rect.fill?.mode === "semi";
      },
      "a new rectangle starts in the remembered style",
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("l");
    await expect(page.getByRole("button", { name: "Thickness 2" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("e"); // never restyled: its own default
    await expect(page.getByRole("button", { name: "Thickness 4" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
  });

  test("Copy burns the fill and its opacity into the pixels", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    const view = await mapper(page, 400);
    await page.keyboard.press("r");
    await drag(page, view.at(50, 50), view.at(250, 150));
    await expectSaved(page, ([r]) => !!r, "drawn");
    await page.getByRole("button", { name: "Color #111827", exact: true }).click();
    await page.getByRole("button", { name: "Semi-transparent" }).click();
    await page.getByRole("button", { name: "Fill color #2563eb" }).click();
    await page.getByRole("slider", { name: "Fill opacity" }).fill("40");
    await expectSaved(page, ([r]) => r?.fill?.mode === "semi" && r.fill.opacity === 0.4, "styled");
    const [r] = await savedShapes(page);
    const [x, y, w, h] = [Math.round(r!.x!), Math.round(r!.y!), Math.round(r!.width!), Math.round(r!.height!)];

    await page.getByRole("button", { name: "Copy" }).click();

    const out = await copiedPixels(page, 0);
    expect([out.width, out.height]).toEqual([400, 300]);
    // 40% of #2563eb (37, 99, 235) over the Capture's grey 200: 200 * 0.6 + c * 0.4.
    nearly(at(out, x + w / 2, y + h / 2), [135, 160, 214, 255]);
    nearly(at(out, x + 10, y + 10), [135, 160, 214, 255]);
    // The 4 px outline is the solid stroke color (#111827), centred on the box edge.
    expect(at(out, x + w / 2, y)).toEqual([17, 24, 39, 255]);
    expect(at(out, x, y + h / 2)).toEqual([17, 24, 39, 255]);
    // Outside the box: the Capture untouched.
    expect(at(out, x + w / 2, y - 10)).toEqual([200, 200, 200, 255]);
    expect(at(out, x + w + 10, y + h / 2)).toEqual([200, 200, 200, 255]);
    expect(at(out, 5, 5)).toEqual([200, 200, 200, 255]);
  });

  test("Copy of a solid-filled ellipse is filled inside and not at the box corners", async ({ page }) => {
    await page.goto("/");
    await capture(page, 400, 300);
    const view = await mapper(page, 400);
    await page.keyboard.press("e");
    await drag(page, view.at(100, 60), view.at(300, 200));
    await expectSaved(page, ([e]) => !!e, "drawn");
    await page.getByRole("button", { name: "Solid" }).click();
    await page.getByRole("button", { name: "Fill color #facc15" }).click();
    await expectSaved(page, ([e]) => e?.fill?.mode === "solid", "styled");
    const [e] = await savedShapes(page);
    const [x, y, w, h] = [Math.round(e!.x!), Math.round(e!.y!), Math.round(e!.width!), Math.round(e!.height!)];

    await page.getByRole("button", { name: "Copy" }).click();

    const out = await copiedPixels(page, 0);
    expect(at(out, x + w / 2, y + h / 2)).toEqual([250, 204, 21, 255]); // solid, no blending
    expect(at(out, x + 4, y + 4)).toEqual([200, 200, 200, 255]); // the box corner is outside the ellipse
    expect(at(out, x + w / 2, y)).toEqual([224, 36, 36, 255]); // the top of the outline
  });
});

test.describe("the renderer, on real canvas pixels", () => {
  test("burns a Line, Rectangle (solid and semi-transparent) and Ellipse in at native size", async ({ page }) => {
    await page.goto("/");
    const png = await page.evaluate(async () => {
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const { renderFinished } = await import(/* @vite-ignore */ "/src/canvas/renderFinished.ts" as string);
      const white = new Uint8Array(200 * 100 * 4).fill(255);
      const capture = encodeRgbaPng(200, 100, white);
      const stroke = { color: "#111827", width: 4 };
      const annotations = [
        // solid red fill, box (10,10)-(60,60), 4 px outline centred on the edge
        { id: "r1", type: "rect", x: 10, y: 10, width: 50, height: 50, stroke, fill: { mode: "solid", color: "#e02424", opacity: 0.2 } },
        // 50% blue over white
        { id: "r2", type: "rect", x: 80, y: 10, width: 50, height: 50, stroke, fill: { mode: "semi", color: "#2563eb", opacity: 0.5 } },
        // unfilled
        { id: "r3", type: "rect", x: 150, y: 10, width: 40, height: 40, stroke, fill: { mode: "none", color: "#facc15", opacity: 1 } },
        { id: "e1", type: "ellipse", x: 10, y: 70, width: 60, height: 24, stroke: { color: "#111827", width: 2 }, fill: { mode: "solid", color: "#16a34a", opacity: 1 } },
        { id: "l1", type: "line", x1: 90, y1: 80, x2: 190, y2: 80, stroke: { color: "#e02424", width: 6 } },
      ];
      const out = await renderFinished({ capture, model: { formatVersion: 1, annotations, crop: null } });
      return Array.from(out as Uint8Array);
    });

    const out = decodePixels(Uint8Array.from(png));
    expect([out.width, out.height]).toEqual([200, 100]);
    // r1: solid fill, then the outline over it (the 4 px band is x 8-11 on the left edge)
    expect(at(out, 35, 35)).toEqual([224, 36, 36, 255]);
    expect(at(out, 9, 35)).toEqual([17, 24, 39, 255]);
    expect(at(out, 11, 35)).toEqual([17, 24, 39, 255]);
    expect(at(out, 13, 35)).toEqual([224, 36, 36, 255]);
    expect(at(out, 6, 35)).toEqual([255, 255, 255, 255]);
    // r2: 50% of #2563eb over white: (255 + c) / 2
    nearly(at(out, 105, 35), [146, 177, 245, 255]);
    // r3: nothing inside
    expect(at(out, 170, 30)).toEqual([255, 255, 255, 255]);
    expect(at(out, 170, 10)).toEqual([17, 24, 39, 255]);
    // e1: filled in the middle, corner of its box empty, outline at the top
    expect(at(out, 40, 82)).toEqual([22, 163, 74, 255]);
    expect(at(out, 12, 72)).toEqual([255, 255, 255, 255]);
    expect(at(out, 40, 70)).toEqual([17, 24, 39, 255]);
    // l1: 6 px thick (rows 77-82)
    expect(at(out, 140, 77)).toEqual([224, 36, 36, 255]);
    expect(at(out, 140, 82)).toEqual([224, 36, 36, 255]);
    expect(at(out, 140, 75)).toEqual([255, 255, 255, 255]);
    expect(at(out, 140, 84)).toEqual([255, 255, 255, 255]);
    expect(at(out, 85, 80)).toEqual([255, 255, 255, 255]); // before the start
  });
});
