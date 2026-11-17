// The area outside the visible area (M4 polish B), with the fake bridge and the stub canvas: no border at rest,
// the canvas margin and darkness settings, the per-image "Show outside the canvas", and the visible area
// following the Annotations that grew it back in. The pixels and the measured spacing are checked by
// e2e/outside.spec.ts on the real canvas.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import type { RectAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = Array.from({ length: 40 * 30 }, () => [10, 20, 30, 255]).flat();
const rect = (id: string, x: number, y: number): RectAnnotation => ({
  id,
  type: "rect",
  x,
  y,
  width: 20,
  height: 20,
  stroke: { color: "#e02424", width: 4 },
  fill: { mode: "none", color: "#facc15", opacity: 0.4 },
});
const boundsOf = (a: RectAnnotation) => ({ x: a.x - 2, y: a.y - 2, width: a.width + 4, height: a.height + 4 });
const CAPTURE = { x: 0, y: 0, width: 40, height: 30 };

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
const imageSection = () => screen.getByRole("region", { name: "Image" });
const showOutside = () => within(imageSection()).getByRole("checkbox", { name: "Show outside the canvas" });
const area = (kit: StubKit) => kit.latest.layout.area;

describe("no border at rest", () => {
  it("draws no frame around the visible area, with or without a crop, and with the Crop tool on", async () => {
    const { kit } = await openWithCapture();
    expect(document.querySelector(".crop-frame")).toBeNull();
    await act(async () => kit.latest.dragCrop({ x: 5, y: 5, width: 20, height: 20 }));
    expect(document.querySelector(".crop-frame")).toBeNull();
    await userEvent.keyboard("c");
    expect(document.querySelector(".crop-frame")).toBeNull();
  });
});

describe("the canvas margin and the outside darkness settings", () => {
  it("the margin around the area is the setting (48 px by default) on all four sides, and follows a change", async () => {
    const bridge = createFakeBridge();
    const { kit } = await openWithCapture(bridge);
    const pad = () => document.querySelector<HTMLElement>(".stage-pad")!;
    // The jsdom well has no size, so the area is shown at 100% with just its margin.
    expect(pad().style.padding).toBe("48px");
    expect(kit.latest.layout.workspace).toEqual({ x: -48, y: -48, width: 136, height: 126 });

    await act(async () => bridge.setCanvasMargin(100));
    expect(pad().style.padding).toBe("100px");
    expect(kit.latest.layout.workspace).toEqual({ x: -100, y: -100, width: 240, height: 230 });
  });

  it("the darkness is 95 percent by default and follows a change from the Settings window at once, to a tenth and up to 99.9", async () => {
    const bridge = createFakeBridge();
    const { kit } = await openWithCapture(bridge);
    expect(kit.latest.layout.darkness).toBe(95);
    expect(document.querySelector<HTMLElement>(".well")!.style.getPropertyValue("--outside-darkness")).toBe("0.95");

    await act(async () => bridge.setOutsideDarkness(0));
    expect(kit.latest.layout.darkness).toBe(0);
    await act(async () => bridge.setOutsideDarkness(99.9));
    expect(kit.latest.layout.darkness).toBe(99.9);
    expect(document.querySelector<HTMLElement>(".well")!.style.getPropertyValue("--outside-darkness")).toBe("0.999");
    await act(async () => bridge.setOutsideDarkness(72.5));
    expect(kit.latest.layout.darkness).toBe(72.5);
  });
});

describe("Show outside the canvas", () => {
  it("is a toggle in the Image section with Select and nothing selected, and with the Crop tool; on unless the file says no", async () => {
    await openWithCapture();
    expect(showOutside()).toBeChecked();
    await userEvent.keyboard("c");
    expect(showOutside()).toBeChecked();
    await userEvent.keyboard("r");
    expect(screen.queryByRole("region", { name: "Image" })).toBeNull();
  });

  it("switching it off is one undo step, tells the canvas, and is saved with the image", async () => {
    const { bridge, kit } = await openWithCapture();
    expect(kit.latest.layout.showOutside).toBe(true);

    await userEvent.click(showOutside());
    expect(kit.latest.model!.showOutside).toBe(false);
    expect(kit.latest.layout.showOutside).toBe(false);
    await autosave();
    expect(decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model.showOutside).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(kit.latest.layout.showOutside).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(kit.latest.layout.showOutside).toBe(false);
  });

  it("a new image takes the Settings default (on by default, off when the setting is off), stored with the image", async () => {
    const first = await openWithCapture();
    expect(first.kit.latest.model!.showOutside).toBe(true);
  });

  it("a new image with the setting off starts with it off", async () => {
    const bridge = createFakeBridge();
    await bridge.setShowOutsideDefault(false);
    const { kit } = await openWithCapture(bridge);
    expect(kit.latest.model!.showOutside).toBe(false);
    expect(kit.latest.layout.showOutside).toBe(false);
    expect(showOutside()).not.toBeChecked();
    // Changing the setting later does not change an image that has its value.
    await act(async () => bridge.setShowOutsideDefault(true));
    expect(kit.latest.layout.showOutside).toBe(false);
  });
});

describe("the visible area follows the Annotations that grew it", () => {
  it("drawing past the edge grows it and moving back inside shrinks it to the Capture again, undoably", async () => {
    const { kit } = await openWithCapture();
    const grower = rect("g", 30, 20);
    await act(async () => kit.latest.draw(grower, boundsOf(grower)));
    expect(area(kit)).toEqual({ x: 0, y: 0, width: 52, height: 42 });

    await act(async () => kit.latest.edit("g", { x: 5, y: 5 } as Partial<RectAnnotation>, boundsOf(rect("g", 5, 5))));
    expect(area(kit)).toEqual(CAPTURE);
    expect(kit.latest.model!.crop).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(area(kit)).toEqual({ x: 0, y: 0, width: 52, height: 42 });
  });

  it("deleting the grower (Delete key) shrinks it, in the same undo step", async () => {
    const { kit } = await openWithCapture();
    const grower = rect("g", 30, 20);
    await act(async () => kit.latest.draw(grower, boundsOf(grower)));
    await act(async () => kit.latest.click("g"));

    await userEvent.keyboard("{Delete}");
    expect(kit.latest.model!.annotations).toEqual([]);
    expect(area(kit)).toEqual(CAPTURE);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(kit.latest.model!.annotations.map((a) => a.id)).toEqual(["g"]);
    expect(area(kit)).toEqual({ x: 0, y: 0, width: 52, height: 42 });
  });

  it("with two growers, deleting one leaves the room the other needs", async () => {
    const { kit } = await openWithCapture();
    const a = rect("a", 30, 5);
    const b = rect("b", 5, 20);
    await act(async () => kit.latest.draw(a, boundsOf(a)));
    await act(async () => kit.latest.draw(b, boundsOf(b)));
    expect(area(kit)).toEqual({ x: 0, y: 0, width: 52, height: 42 });
    await act(async () => kit.latest.click("a"));
    await userEvent.keyboard("{Delete}");
    expect(area(kit)).toEqual({ x: 0, y: 0, width: 40, height: 42 });
  });

  it("an explicit Crop after growth is final: deleting the grower afterwards leaves the area", async () => {
    const { kit } = await openWithCapture();
    const grower = rect("g", 30, 20);
    await act(async () => kit.latest.draw(grower, boundsOf(grower)));
    await userEvent.keyboard("c");
    await act(async () => kit.latest.dragCrop({ x: 0, y: 0, width: 52, height: 42 }, "handle"));
    await userEvent.keyboard("{Escape}");
    await act(async () => kit.latest.click("g"));
    await userEvent.keyboard("{Delete}");
    expect(area(kit)).toEqual({ x: 0, y: 0, width: 52, height: 42 });
  });

  it("Remove crop after growth is an explicit area too (one step, undoable)", async () => {
    const { kit } = await openWithCapture();
    const grower = rect("g", 30, 20);
    await act(async () => kit.latest.draw(grower, boundsOf(grower)));
    await userEvent.click(screen.getByRole("button", { name: "Remove crop" }));
    expect(area(kit)).toEqual(CAPTURE);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(area(kit)).toEqual({ x: 0, y: 0, width: 52, height: 42 });
  });
});
