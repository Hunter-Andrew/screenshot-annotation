import { expect, type Page, test } from "@playwright/test";

// The Callout's tail stays put while the box is resized from any of the eight handles, in real Chromium with the
// real Fabric objects (and once through the real pointer). Coordinates are Capture pixels; the stored tip is an
// offset from the text box's top-left corner, so the tip's absolute spot is (x + tip.x, y + tip.y).

const font = { size: 20, bold: false, italic: false, color: "#e02424", align: "left", valign: "middle", underline: false };
const base = {
  id: "c",
  type: "callout",
  x: 200,
  y: 150,
  width: 200,
  minHeight: 60,
  text: "Hello there",
  font,
  textOutline: { enabled: false, color: "#ffffff", width: 2 },
  stroke: { color: "#e02424", width: 3 },
  fill: { mode: "solid", color: "#ffffff", opacity: 0.4 },
  tail: { enabled: true },
};

const HANDLES = ["tl", "mt", "tr", "ml", "mr", "bl", "mb", "br"] as const;
/** Where each handle is dragged to (scene points), chosen so each one visibly changes the box. */
const TARGET: Record<(typeof HANDLES)[number], [number, number]> = {
  tl: [170, 120],
  mt: [300, 190],
  tr: [450, 110],
  ml: [240, 200],
  mr: [330, 200],
  bl: [160, 300],
  mb: [300, 280],
  br: [470, 320],
};

interface Result {
  before: { x: number; y: number };
  after: { x: number; y: number };
  box: { x: number; y: number; width: number; minHeight?: number };
  hadTip: boolean;
}

async function resize(page: Page, handle: string, to: [number, number], tip: { x: number; y: number } | null): Promise<Result> {
  return page.evaluate(
    async ({ base, handle, to, tip }) => {
      const { CalloutShape } = await import(/* @vite-ignore */ "/src/canvas/shapes/calloutShape.ts" as string);
      const shape = new CalloutShape({ ...base, ...(tip ? { tip } : {}) });
      const absolute = () => {
        const c = shape.toCallout();
        // Without a stored tip the tail points at the default spot below the box.
        const offset = c.tip ?? { x: Math.min(32, c.width / 4), y: shape.height + 32 };
        return { x: c.x + offset.x, y: c.y + offset.y };
      };
      const before = absolute();
      shape.dragHandle(handle, to[0], to[1]);
      const c = shape.toCallout();
      return { before, after: absolute(), box: { x: c.x, y: c.y, width: c.width, minHeight: c.minHeight }, hadTip: !!c.tip };
    },
    { base, handle, to, tip },
  );
}

test.describe("the tail does not move when the box is resized", () => {
  for (const handle of HANDLES) {
    test(`from the ${handle} handle, with a tip the user placed`, async ({ page }) => {
      await page.goto("/");
      const r = await resize(page, handle, TARGET[handle], { x: -80, y: 140 });
      expect(r.hadTip).toBe(true);
      expect(r.after.x).toBeCloseTo(r.before.x, 3);
      expect(r.after.y).toBeCloseTo(r.before.y, 3);
      // The box really did change (the test would pass vacuously if nothing moved).
      expect(r.box.x !== base.x || r.box.y !== base.y || r.box.width !== base.width || r.box.minHeight !== base.minHeight).toBe(true);
    });

    test(`from the ${handle} handle, with the default tip: it is frozen where it was on the first resize`, async ({ page }) => {
      await page.goto("/");
      const r = await resize(page, handle, TARGET[handle], null);
      expect(r.hadTip).toBe(true); // stored now: it no longer follows the box
      expect(r.after.x).toBeCloseTo(r.before.x, 3);
      expect(r.after.y).toBeCloseTo(r.before.y, 3);
    });
  }

  test("several drags in a row keep it there, and a tip the box grows over simply has no tail to draw", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(
      async ({ base }) => {
        const { CalloutShape } = await import(/* @vite-ignore */ "/src/canvas/shapes/calloutShape.ts" as string);
        const { bubbleBox, tailTo } = await import(/* @vite-ignore */ "/src/core/annotations/calloutGeometry.ts" as string);
        const shape = new CalloutShape({ ...base, tip: { x: 50, y: 150 } }); // absolute (250, 300)
        for (const [handle, x, y] of [["br", 420, 260], ["tl", 180, 120], ["mb", 300, 340], ["ml", 230, 200]] as const) shape.dragHandle(handle, x, y);
        const c = shape.toCallout();
        const tip = { x: c.x + c.tip!.x, y: c.y + c.tip!.y };
        const box = bubbleBox({ left: c.x, top: c.y, width: c.width, height: shape.height });
        return { tip, tail: tailTo(box, { x: c.tip!.x + c.x, y: c.tip!.y + c.y }) };
      },
      { base },
    );
    expect(r.tip.x).toBeCloseTo(250, 3);
    expect(r.tip.y).toBeCloseTo(300, 3);
    expect(r.tail).toBeNull(); // the box now covers the tip: nothing to point out of it
  });

  test("moving the whole callout moves the tip with it", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(
      async ({ base }) => {
        const { CalloutShape } = await import(/* @vite-ignore */ "/src/canvas/shapes/calloutShape.ts" as string);
        const shape = new CalloutShape({ ...base, tip: { x: -80, y: 140 } });
        shape.set({ left: shape.left + 70, top: shape.top - 20 });
        const c = shape.toCallout();
        return { x: c.x, y: c.y, tip: c.tip };
      },
      { base },
    );
    expect(r).toEqual({ x: 270, y: 130, tip: { x: -80, y: 140 } });
  });
});

type InPage = {
  __fakeBridge: {
    simulateCapture(shot: { width: number; height: number; rgba: Uint8Array; capturedAt?: Date }): void;
    libraryFiles: { path: string; bytes: Uint8Array }[];
  };
};
interface SavedCallout {
  x: number;
  y: number;
  width: number;
  minHeight?: number;
  text: string;
  tip?: { x: number; y: number };
}

test("with the real pointer: dragging a side handle of a saved callout leaves its tip where it was", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/");
  await page.evaluate(() => {
    const rgba = new Uint8Array(600 * 400 * 4).fill(255);
    (window as unknown as InPage).__fakeBridge.simulateCapture({ width: 600, height: 400, rgba, capturedAt: new Date() });
  });
  await expect(page.locator(".canvas-container")).toHaveCount(1);
  await expect(page.getByText(/Saved to/)).toBeVisible();
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  const stage = (await page.locator(".stage").boundingBox())!;
  const at = (x: number, y: number) => ({ x: stage.x + x, y: stage.y + y });
  const saved = (): Promise<SavedCallout[]> =>
    page.evaluate(async () => {
      const { decodeLibraryPng } = await import(/* @vite-ignore */ "/src/core/annotatedImage.ts" as string);
      const file = (window as unknown as InPage).__fakeBridge.libraryFiles.at(-1);
      return file ? (decodeLibraryPng(file.bytes).model.annotations as never) : [];
    });

  // Draw a callout with its tail on: press (100,100) is the tip, release (340,180) the far corner.
  await page.keyboard.press("o");
  const press = at(100, 100);
  await page.mouse.move(press.x, press.y);
  await page.mouse.down();
  await page.mouse.move(at(340, 180).x, at(340, 180).y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved())[0]?.text).toBe("Hi");
  const [first] = await saved();
  const tipBefore = { x: first!.x + first!.tip!.x, y: first!.y + first!.tip!.y };
  expect(Math.abs(tipBefore.x - 100)).toBeLessThanOrEqual(1);
  expect(Math.abs(tipBefore.y - 100)).toBeLessThanOrEqual(1);

  // The right-middle handle: pad 10 around the text box. Drag it 60 px to the left.
  const handle = at(first!.x + first!.width + 10, first!.y + (first!.minHeight ?? 30) / 2);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x - 30, handle.y, { steps: 5 });
  await page.mouse.move(handle.x - 60, handle.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await saved())[0]!.width)).toBeLessThan(Math.round(first!.width) - 40);
  const [after] = await saved();
  expect(Math.abs(after!.x + after!.tip!.x - tipBefore.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after!.y + after!.tip!.y - tipBefore.y)).toBeLessThanOrEqual(1);
});
