import { expect, type Page, test } from "@playwright/test";
import { decodePixels, hasChunk } from "../src/core/testing";

// Real Chromium with the real Fabric canvas and the fake platform bridge. The model is read back the
// way the next app start reads it: by decoding the Library PNG the editor auto-saved.

interface Arrow {
  id: string;
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: { color: string; width: number };
  arrowheads: { ends: "end" | "both" };
}
/** The bits of the fake platform bridge these tests read (the page exposes it as `window.__fakeBridge`). */
interface Bridge {
  simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
  copiedImages: Uint8Array[];
  savedAs: { bytes: Uint8Array }[];
  libraryFiles: { path: string; bytes: Uint8Array }[];
  libraryUpdates: { path: string; bytes: Uint8Array }[];
  settingsOpened: number;
}
type InPage = { __fakeBridge: Bridge };

/** Show a flat grey Capture of the given size (unlike the default gradient, any pixel's expected value is known). */
async function capture(page: Page, width: number, height: number, capturedAt = new Date()) {
  await page.evaluate(
    ({ width, height, stamp }) => {
      const rgba = new Uint8Array(width * height * 4).fill(200);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      (window as unknown as InPage).__fakeBridge.simulateCapture({ width, height, rgba, capturedAt: new Date(stamp) });
    },
    { width, height, stamp: capturedAt.getTime() },
  );
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1); // the annotation canvas is up
}

/** The Annotations in the newest Library file, decoded as the next app start would. */
async function savedAnnotations(page: Page): Promise<Arrow[]> {
  return page.evaluate(async () => {
    const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
    const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
    return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
  });
}

/** Converts Capture pixels to page coordinates, through the stage's current on-screen size. */
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

const close = (a: number, b: number, tolerance = 3) => Math.abs(a - b) <= tolerance;

async function expectSaved(page: Page, check: (arrows: Arrow[]) => boolean, message: string) {
  await expect
    .poll(async () => check(await savedAnnotations(page)), { message, timeout: 6000, intervals: [200] })
    .toBe(true);
}

// A small window and a Capture bigger than its well: shown scaled down, so the pointer mapping is
// exercised too, yet small enough for the fake Library (browser storage) to keep across the reload.
test.describe("an Arrow's life", () => {
  test.use({ viewport: { width: 760, height: 520 } });

test("draw an arrow, move it, resize it, restyle it, reload, and it is still editable", async ({ page }) => {
  await page.goto("/");
  await capture(page, 600, 400);
  const view = await mapper(page, 600);
  expect(view.scale).toBeLessThan(0.8);

  // Draw with the Arrow tool (A).
  await page.keyboard.press("a");
  await expect(page.getByRole("button", { name: /^Arrow/ })).toHaveAttribute("aria-pressed", "true");
  await drag(page, view.at(80, 120), view.at(320, 120));
  await expectSaved(
    page,
    ([a]) => !!a && close(a.x1, 80) && close(a.y1, 120) && close(a.x2, 320) && close(a.y2, 120),
    "the arrow is saved where it was drawn",
  );
  // It is selected (Style panel shows its groups) and the tool went back to Select.
  await expect(page.getByRole("region", { name: "Arrowheads" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
  expect((await savedAnnotations(page))[0]).toMatchObject({
    stroke: { color: "#e02424", width: 4 },
    arrowheads: { ends: "end" },
  });

  // Move: drag the line by 80 px down.
  await drag(page, view.at(200, 120), view.at(200, 200));
  await expectSaved(
    page,
    ([a]) => !!a && close(a.y1, 200) && close(a.y2, 200) && close(a.x1, 80) && close(a.x2, 320),
    "moving keeps the shape and changes only the position",
  );

  // Resize: drag the end-point handle to the right.
  await drag(page, view.at(320, 200), view.at(480, 200));
  await expectSaved(
    page,
    ([a]) => !!a && close(a.x2, 480) && close(a.y2, 200) && close(a.x1, 80) && close(a.y1, 200),
    "dragging an end moves only that end",
  );

  // Restyle from the Style panel: color and both ends.
  await page.getByRole("button", { name: "Color #2563eb" }).click();
  await page.getByRole("button", { name: "Both ends" }).click();
  await expectSaved(
    page,
    ([a]) => a?.stroke.color === "#2563eb" && a.arrowheads.ends === "both",
    "the restyle is saved",
  );

  // Reload the page: the image comes back from the Library with the arrow still editable.
  await page.reload();
  await expect(page.getByRole("img", { name: "Capture" })).toBeVisible();
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  const again = await mapper(page, 600);
  await page.mouse.click(again.at(280, 200).x, again.at(280, 200).y); // click the arrow
  await expect(page.getByRole("button", { name: "Both ends" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Color #2563eb" })).toHaveAttribute("aria-pressed", "true");
  await drag(page, again.at(280, 200), again.at(280, 300)); // and it can still be moved
  await expectSaved(page, ([a]) => !!a && close(a.y1, 300) && close(a.y2, 300), "the reopened arrow moved");
  expect(await page.evaluate(() => (window as unknown as InPage).__fakeBridge.libraryFiles.length)).toBe(1);
});
});

test("Copy has the arrow burned in, and is still a plain PNG", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 300);
  const view = await mapper(page, 400);
  await page.keyboard.press("a");
  await drag(page, view.at(50, 150), view.at(350, 150));
  await expectSaved(page, ([a]) => !!a, "drawn");

  await page.getByRole("button", { name: "Copy", exact: true }).click();

  await expect.poll(() => page.evaluate(() => (window as unknown as InPage).__fakeBridge.copiedImages.length)).toBe(1);
  const png = Uint8Array.from(await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.copiedImages[0]!)));
  expect(hasChunk(png, "snAP")).toBe(false);
  const { width, height, rgba } = decodePixels(png);
  expect([width, height]).toEqual([400, 300]);
  const pixel = (x: number, y: number) => rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 4);
  // On the shaft (red #e02424, solid) and well off it (the Capture's own grey, untouched).
  const [a] = await savedAnnotations(page);
  const midX = Math.round((a!.x1 + a!.x2) / 2);
  const midY = Math.round(a!.y1);
  expect(pixel(midX, midY)).toEqual([224, 36, 36, 255]);
  expect(pixel(midX, midY - 40)).toEqual([200, 200, 200, 255]);
  expect(pixel(5, 5)).toEqual([200, 200, 200, 255]);
});

test("Save as PNG… also burns the arrow in", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 300);
  const view = await mapper(page, 400);
  await page.keyboard.press("a");
  await drag(page, view.at(50, 150), view.at(350, 150));
  await expectSaved(page, ([a]) => !!a, "drawn");

  await page.getByRole("button", { name: "Save as PNG…" }).click();

  await expect(page.getByText(/Saved a copy to/)).toBeVisible();
  const png = Uint8Array.from(
    await page.evaluate(() => Array.from((window as unknown as InPage).__fakeBridge.savedAs[0]!.bytes)),
  );
  expect(hasChunk(png, "snAP")).toBe(false);
  const { width, rgba } = decodePixels(png);
  expect(Array.from(rgba.slice((150 * width + 200) * 4, (150 * width + 200) * 4 + 4))).toEqual([224, 36, 36, 255]);
});

test("V and A pick tools, Esc deselects and returns to Select", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 300);
  const view = await mapper(page, 400);
  const select = page.getByRole("button", { name: /^Select/ });
  const arrow = page.getByRole("button", { name: /^Arrow/ });

  await page.keyboard.press("a");
  await expect(arrow).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("v");
  await expect(select).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("a");
  await drag(page, view.at(50, 100), view.at(300, 100));
  await expect(page.getByRole("region", { name: "Stroke" })).toBeVisible(); // selected
  await page.keyboard.press("a");
  await page.keyboard.press("Escape");
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Select an Annotation, or pick a tool/)).toBeVisible(); // deselected
});

test("auto-save waits about 1 s after an edit", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 300);
  const view = await mapper(page, 400);
  await page.keyboard.press("a");
  await drag(page, view.at(50, 100), view.at(300, 100));

  const waited = await page.evaluate(async () => {
    const start = performance.now();
    while ((window as unknown as InPage).__fakeBridge.libraryUpdates.length === 0 && performance.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    return performance.now() - start;
  });

  // The gesture finished a moment before `start`, so the delay is just under 1000 ms here.
  expect(waited).toBeGreaterThan(600);
  expect(waited).toBeLessThan(1600);
});

test("Discard right after drawing leaves no file behind and nothing is written later", async ({ page }) => {
  await page.goto("/");
  await capture(page, 400, 300);
  const view = await mapper(page, 400);
  await page.keyboard.press("a");
  await drag(page, view.at(50, 100), view.at(300, 100));

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText(/Discarded/)).toBeVisible();
  await page.waitForTimeout(2500);

  expect(await page.evaluate(() => (window as unknown as InPage).__fakeBridge.libraryFiles.length)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as InPage).__fakeBridge.libraryUpdates.length)).toBe(0);
});

test("the gear opens Settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  expect(await page.evaluate(() => (window as unknown as InPage).__fakeBridge.settingsOpened)).toBe(1);
});

test.describe("the renderer, on real canvas pixels", () => {
  test("burns an Arrow into the Capture at native size and applies a Crop", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const { encodeRgbaPng } = await import(/* @vite-ignore */ "/src/core/png.ts" as string);
      const { renderFinished } = await import(/* @vite-ignore */ "/src/canvas/renderFinished.ts" as string);
      const white = new Uint8Array(100 * 60 * 4).fill(255);
      const capture = encodeRgbaPng(100, 60, white);
      const arrow = {
        id: "a",
        type: "arrow" as const,
        x1: 10,
        y1: 30,
        x2: 90,
        y2: 30,
        stroke: { color: "#e02424", width: 4 },
        arrowheads: { ends: "end" as const },
      };
      const full = await renderFinished({ capture, model: { formatVersion: 1, annotations: [arrow], crop: null } });
      const cropped = await renderFinished({
        capture,
        model: { formatVersion: 1, annotations: [arrow], crop: { x: 40, y: 20, width: 20, height: 20 } },
      });
      return { full: Array.from(full), cropped: Array.from(cropped) };
    });

    const full = decodePixels(Uint8Array.from(result.full));
    const at = (p: ReturnType<typeof decodePixels>, x: number, y: number) =>
      p.rgba.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4);
    expect([full.width, full.height]).toEqual([100, 60]);
    expect(at(full, 50, 29)).toEqual([224, 36, 36, 255]); // the shaft: rows 28-31 for a 4 px line centred on 30
    expect(at(full, 50, 31)).toEqual([224, 36, 36, 255]);
    expect(at(full, 50, 20)).toEqual([255, 255, 255, 255]); // untouched
    expect(at(full, 5, 30)).toEqual([255, 255, 255, 255]); // before the start
    expect(at(full, 85, 30)).toEqual([224, 36, 36, 255]); // inside the head
    expect(at(full, 85, 22)).toEqual([255, 255, 255, 255]); // above the head's base corner

    const cropped = decodePixels(Uint8Array.from(result.cropped));
    expect([cropped.width, cropped.height]).toEqual([20, 20]);
    expect(at(cropped, 10, 10)).toEqual([224, 36, 36, 255]); // the shaft at (50, 30) is the crop's (10, 10)
    expect(at(cropped, 10, 0)).toEqual([255, 255, 255, 255]);
  });
});

// Andrew's note on ticket 09: vertical scrolling felt off. The rules are in src/editor/view.ts; these
// check the real layout follows them.
test.describe("fit and scroll", () => {
  const rects = (page: Page) =>
    page.evaluate(() => {
      const well = document.querySelector(".well")!;
      const stage = document.querySelector(".stage")!.getBoundingClientRect();
      const box = well.getBoundingClientRect();
      return {
        stage: { top: stage.top, bottom: stage.bottom, left: stage.left, right: stage.right },
        well: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
        scrollTop: well.scrollTop,
        scrollHeight: well.scrollHeight,
        clientHeight: well.clientHeight,
        scrollWidth: well.scrollWidth,
        clientWidth: well.clientWidth,
      };
    });
  const insideWell = (r: Awaited<ReturnType<typeof rects>>) =>
    r.stage.top >= r.well.top - 0.5 &&
    r.stage.bottom <= r.well.bottom + 0.5 &&
    r.stage.left >= r.well.left - 0.5 &&
    r.stage.right <= r.well.right + 0.5;

  test("the editor exactly fills the window: the page itself never scrolls, only the well does", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 2400);
    await page.getByRole("button", { name: "100%" }).click(); // even with a huge image on show

    const page_ = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bottom: document.querySelector(".statusbar")!.getBoundingClientRect().bottom,
    }));
    expect(page_.scrollHeight).toBeLessThanOrEqual(page_.innerHeight);
    expect(page_.scrollWidth).toBeLessThanOrEqual(page_.innerWidth);
    expect(page_.bottom).toBeLessThanOrEqual(page_.innerHeight); // the status bar is not pushed off the bottom
  });

  test("a tall Capture is fitted whole into the well, with nothing to scroll", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 2400);

    const r = await rects(page);
    expect(insideWell(r)).toBe(true);
    expect(r.scrollHeight).toBeLessThanOrEqual(r.clientHeight);
    expect(r.scrollWidth).toBeLessThanOrEqual(r.clientWidth);
    await expect(page.getByLabel("Zoom level")).not.toHaveText("100%");
  });

  test("a window resize refits, shrinking and growing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await capture(page, 300, 2400);
    const tall = (await rects(page)).stage.bottom - (await rects(page)).stage.top;

    await page.setViewportSize({ width: 1280, height: 500 });
    await expect.poll(async () => insideWell(await rects(page))).toBe(true);
    const short = (await rects(page)).stage.bottom - (await rects(page)).stage.top;
    expect(short).toBeLessThan(tall);
    expect((await rects(page)).scrollHeight).toBeLessThanOrEqual((await rects(page)).clientHeight);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(async () => {
        const r = await rects(page);
        return r.stage.bottom - r.stage.top > tall;
      })
      .toBe(true);
    expect(insideWell(await rects(page))).toBe(true);
  });

  test("at 100% a tall Capture scrolls from its very top to its very bottom, and Fit brings it back", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 2400);

    await page.getByRole("button", { name: "100%" }).click();
    await expect(page.getByLabel("Zoom level")).toHaveText("100%");
    let r = await rects(page);
    expect(r.scrollHeight).toBeGreaterThan(r.clientHeight);

    await page.locator(".well").evaluate((el) => (el.scrollTop = 0));
    r = await rects(page);
    expect(r.stage.top).toBeGreaterThanOrEqual(r.well.top); // the top is reachable, not clipped away
    // Above the image is its dark margin (ticket 37), at most half the well.
    expect(r.stage.top).toBeLessThanOrEqual(r.well.top + (r.well.bottom - r.well.top) / 2);

    await page.locator(".well").evaluate((el) => (el.scrollTop = el.scrollHeight));
    r = await rects(page);
    expect(r.stage.bottom).toBeLessThanOrEqual(r.well.bottom + 0.5); // the bottom is reachable too
    expect(r.stage.bottom).toBeGreaterThanOrEqual(r.well.bottom - (r.well.bottom - r.well.top) / 2);

    await page.keyboard.press("Control+0");
    r = await rects(page);
    expect(insideWell(r)).toBe(true);
    expect(r.scrollTop).toBe(0);
  });

  test("zooming keeps the middle of the view in the middle", async ({ page }) => {
    await page.goto("/");
    await capture(page, 1600, 1000);
    // The image row under the middle of the well, before and after zooming in on a scrolled view.
    const centreRow = () =>
      page.evaluate(() => {
        const well = document.querySelector(".well")!.getBoundingClientRect();
        const stage = document.querySelector(".stage")!.getBoundingClientRect();
        return ((well.top + well.height / 2 - stage.top) / stage.height) * 1000;
      });
    await page.getByRole("button", { name: "100%" }).click();
    await page.locator(".well").evaluate((el) => (el.scrollTop = 200));
    const before = await centreRow();

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByLabel("Zoom level")).toHaveText("150%");

    expect(Math.abs((await centreRow()) - before)).toBeLessThan(3);
  });

  test("showing another image starts at Fit and at the top, not at the old scroll position", async ({ page }) => {
    await page.goto("/");
    await capture(page, 300, 2400, new Date(2026, 10, 15, 13, 0, 0));
    await page.getByRole("button", { name: "100%" }).click();
    await page.locator(".well").evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
    expect((await rects(page)).scrollTop).toBeGreaterThan(100);

    await capture(page, 1200, 3000, new Date(2026, 10, 15, 13, 1, 0));

    await expect.poll(async () => (await rects(page)).scrollTop).toBe(0);
    expect(insideWell(await rects(page))).toBe(true);
    await expect(page.getByLabel("Zoom level")).not.toHaveText("100%");
    // And Discard, which falls back to the first image, does the same.
    await page.getByRole("button", { name: "100%" }).click();
    await page.locator(".well").evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
    await page.getByRole("button", { name: "Discard" }).click();
    await expect.poll(async () => (await rects(page)).scrollTop).toBe(0);
    expect(insideWell(await rects(page))).toBe(true);
  });

  test("an arrow drawn while zoomed and scrolled lands where the pointer is", async ({ page }) => {
    await page.goto("/");
    await capture(page, 1600, 1000);
    await page.getByRole("button", { name: "100%" }).click();
    await page.locator(".well").evaluate((el) => {
      el.scrollLeft = 300;
      el.scrollTop = 200;
    });
    const view = await mapper(page, 1600);
    expect(view.scale).toBeCloseTo(1, 2);

    await page.keyboard.press("a");
    const start = view.at(300, 300);
    // Screen coordinates of image point (900, 700), if it is on screen at this scroll position.
    const box = (await page.locator(".well").boundingBox())!;
    const from = { x: Math.min(start.x, box.x + box.width - 60), y: Math.min(start.y, box.y + box.height - 60) };
    const to = { x: from.x + 100, y: from.y + 50 };
    const stage = (await page.locator(".stage").boundingBox())!;
    await drag(page, from, to);

    await expectSaved(
      page,
      ([a]) =>
        !!a &&
        close(a.x1, from.x - stage.x) &&
        close(a.y1, from.y - stage.y) &&
        close(a.x2 - a.x1, 100) &&
        close(a.y2 - a.y1, 50),
      "drawing while zoomed and scrolled maps the pointer to Capture pixels",
    );
  });
});
