// Crop in the editor (ticket 21): the C tool, one rectangle drag sets the visible area, the rest of the
// Capture is dimmed (still shown, still editable), Remove crop and Undo widen it again, and every change
// reaches the Library file's model. The pixels themselves are checked by the Playwright tests (e2e/crop.spec.ts).
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import type { RectAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = Array.from({ length: 40 * 30 }, () => [10, 20, 30, 255]).flat();
const CROP = { x: 10, y: 5, width: 20, height: 15 };
const RECT: RectAnnotation = {
  id: "r1",
  type: "rect",
  x: 0,
  y: 0,
  width: 2,
  height: 1,
  stroke: { color: "#e02424", width: 4 },
  fill: { mode: "none", color: "#facc15", opacity: 0.4 },
};

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openWithCapture(bridge: FakeBridge = createFakeBridge()) {
  const kit: StubKit = createStubKit();
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 40, height: 30, rgba: PIXELS, capturedAt: new Date(2026, 10, 15, 13, 45, 1) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  return { bridge, kit };
}
const autosave = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
const savedCrop = (bridge: FakeBridge) => decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model.crop;
const frame = () => document.querySelector<HTMLElement>(".crop-frame");

describe("the Crop tool", () => {
  it("is in the tool column with its key, and C picks it", async () => {
    const { kit } = await openWithCapture();

    expect(screen.getByRole("navigation", { name: "Tools" })).toHaveTextContent(/Crop\s*C/);
    await userEvent.keyboard("c");

    expect(kit.latest.tool).toBe("crop");
    expect(screen.getByRole("button", { name: /^Crop/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("a dragged rectangle sets the visible area, saved with the image, and the tool returns to Select", async () => {
    const { bridge, kit } = await openWithCapture();
    await userEvent.keyboard("c");

    await act(async () => kit.latest.dragCrop(CROP));
    await autosave();

    expect(kit.latest.model!.crop).toEqual(CROP);
    expect(kit.latest.tool).toBe("select");
    expect(savedCrop(bridge)).toEqual(CROP);
  });

  it("a second rectangle replaces the first, bigger or smaller (widening by drawing)", async () => {
    const { kit } = await openWithCapture();
    await act(async () => kit.latest.dragCrop(CROP));
    await userEvent.keyboard("c");

    await act(async () => kit.latest.dragCrop({ x: 2, y: 2, width: 30, height: 20 }));
    expect(kit.latest.model!.crop).toEqual({ x: 2, y: 2, width: 30, height: 20 });

    // Back to exactly the whole Capture is no crop at all.
    await userEvent.keyboard("c");
    await act(async () => kit.latest.dragCrop({ x: 0, y: 0, width: 40, height: 30 }));
    expect(kit.latest.model!.crop).toBeNull();
  });
});

describe("while the image has a crop", () => {
  it("shows no crop frame without a crop, and outlines the visible area once cropped", async () => {
    const { kit } = await openWithCapture();
    expect(frame()).toBeNull();

    await act(async () => kit.latest.dragCrop(CROP));

    const el = frame()!;
    expect(el).not.toBeNull();
    // The frame outlines the visible area, which is the box the Capture is laid out in; the canvas dims the rest.
    expect((el.parentElement as HTMLElement).style.width).toBe(`${CROP.width * kit.latest.scale}px`);
    expect(kit.latest.layout.area).toEqual(CROP);
    // The whole Capture stays on screen and every Annotation stays editable.
    expect(screen.getByRole("img", { name: "Capture" })).toBeVisible();
    await act(async () => kit.latest.draw(RECT));
    expect(kit.latest.model!.annotations.map((a) => a.id)).toEqual(["r1"]);
  });

  it("Remove crop restores the full area, is one undo step, and only shows while there is a crop", async () => {
    const { bridge, kit } = await openWithCapture();
    expect(screen.queryByRole("button", { name: "Remove crop" })).toBeNull();
    await act(async () => kit.latest.dragCrop(CROP));

    await userEvent.click(screen.getByRole("button", { name: "Remove crop" }));
    expect(kit.latest.model!.crop).toBeNull();
    expect(frame()).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove crop" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(kit.latest.model!.crop).toEqual(CROP);
    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(kit.latest.model!.crop).toBeNull();
    await autosave();
    expect(savedCrop(bridge)).toBeNull();
  });

  it("Undo takes a crop back, and the Capture bytes in the file are the same as before", async () => {
    const { bridge, kit } = await openWithCapture();
    const before = decodeLibraryPng(bridge.libraryFiles[0]!.bytes).capture;
    await act(async () => kit.latest.dragCrop(CROP));

    await userEvent.keyboard("{Control>}z{/Control}");
    await autosave();

    expect(kit.latest.model!.crop).toBeNull();
    expect(decodeLibraryPng(bridge.libraryFiles[0]!.bytes).capture).toEqual(before);
  });
});

describe("Copy and Save as PNG with a crop", () => {
  it("hand the renderer the image with its crop", async () => {
    const { bridge, kit } = await openWithCapture();
    const seen: unknown[] = [];
    const render = kit.render;
    kit.render = async (image) => (seen.push(image.model.crop), render(image));
    await act(async () => kit.latest.dragCrop(CROP));

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(bridge.copiedImages).toHaveLength(1));
    expect(seen).toContainEqual(CROP);
  });
});
