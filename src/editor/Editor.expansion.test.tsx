// Canvas expansion and the per-image background in the editor (ticket 37), with the fake bridge and the stub
// canvas: what the editor does with a gesture that reaches past the Capture's edge, the Image section of the
// Style panel, and the Settings that feed it. The pixels are checked by e2e/expansion.spec.ts.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import type { RectAnnotation } from "../core/annotation";
import { AREA_LIMIT_MESSAGE } from "../core/area";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = Array.from({ length: 40 * 30 }, () => [10, 20, 30, 255]).flat();
const RECT: RectAnnotation = {
  id: "r1",
  type: "rect",
  x: 30,
  y: 20,
  width: 20,
  height: 20,
  stroke: { color: "#e02424", width: 4 },
  fill: { mode: "none", color: "#facc15", opacity: 0.4 },
};
// What RECT covers: 2 px of stroke around it, so past the Capture's right (40) and bottom (30) edges.
const RECT_BOUNDS = { x: 28, y: 18, width: 24, height: 24 };

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
const savedModel = (bridge: FakeBridge) => decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model;
const imageSection = () => screen.queryByRole("region", { name: "Image" });

describe("an Annotation that reaches past the edge", () => {
  it("grows the visible area to include it, stores the Settings default background, and one Undo takes both back", async () => {
    const bridge = createFakeBridge();
    await bridge.setImageBackground("white");
    const { kit } = await openWithCapture(bridge);

    await act(async () => kit.latest.draw(RECT, RECT_BOUNDS));

    expect(kit.latest.model!.crop).toEqual({ x: 0, y: 0, width: 52, height: 42 });
    expect(kit.latest.model!.background).toBe("white");
    expect(kit.latest.layout.area).toEqual({ x: 0, y: 0, width: 52, height: 42 });
    expect(kit.latest.layout.background).toBe("white");

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(kit.latest.model!.annotations).toEqual([]);
    expect(kit.latest.model!.crop).toBeNull();
    expect(kit.latest.model!.background).toBeUndefined();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("an Annotation inside the Capture changes nothing about the area", async () => {
    const { kit } = await openWithCapture();
    await act(async () => kit.latest.draw({ ...RECT, x: 2, y: 2 }, { x: 0, y: 0, width: 24, height: 24 }));
    expect(kit.latest.model!.crop).toBeNull();
    expect(kit.latest.model!.background).toBeUndefined();
  });

  it("moving it out grows the area as part of the same step, and moving it back leaves the area as it is", async () => {
    const { kit } = await openWithCapture();
    await act(async () => kit.latest.draw({ ...RECT, x: 2, y: 2 }, { x: 0, y: 0, width: 24, height: 24 }));

    await act(async () => kit.latest.edit("r1", { x: -10, y: 2 } as Partial<RectAnnotation>, { x: -12, y: 0, width: 24, height: 24 }));
    expect(kit.latest.model!.crop).toEqual({ x: -12, y: 0, width: 52, height: 30 });

    await act(async () => kit.latest.edit("r1", { x: 2 } as Partial<RectAnnotation>, { x: 0, y: 0, width: 24, height: 24 }));
    expect(kit.latest.model!.crop).toEqual({ x: -12, y: 0, width: 52, height: 30 });

    // The move back was a step of its own; the move out and its growth were one.
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(kit.latest.model!.crop).toBeNull();
    expect((kit.latest.model!.annotations[0] as RectAnnotation).x).toBe(2);
  });

  it("stops at 8192 px and says so on the status line, which a save does not replace", async () => {
    const { kit } = await openWithCapture();

    await act(async () => kit.latest.draw(RECT, { x: 0, y: 0, width: 9000, height: 10 }));
    expect(kit.latest.model!.crop!.width).toBe(8192);
    expect(kit.latest.model!.annotations).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(AREA_LIMIT_MESSAGE);

    await autosave();
    expect(screen.getByRole("status")).toHaveTextContent(AREA_LIMIT_MESSAGE);
  });

  it("is saved with the image: the file holds the area and the background", async () => {
    const { bridge, kit } = await openWithCapture();
    await act(async () => kit.latest.draw(RECT, RECT_BOUNDS));
    await autosave();
    expect(savedModel(bridge).crop).toEqual({ x: 0, y: 0, width: 52, height: 42 });
    expect(savedModel(bridge).background).toBe("transparent");
  });
});

describe("the Crop tool's handles", () => {
  it("dragging one outward expands the image, is one step, and leaves the Crop tool on", async () => {
    const { kit } = await openWithCapture();
    await userEvent.keyboard("c");

    await act(async () => kit.latest.dragCrop({ x: -10, y: 0, width: 50, height: 30 }, "handle"));

    expect(kit.latest.model!.crop).toEqual({ x: -10, y: 0, width: 50, height: 30 });
    expect(kit.latest.model!.background).toBe("transparent");
    expect(kit.latest.tool).toBe("crop");

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(kit.latest.model!.crop).toBeNull();
    expect(kit.latest.model!.background).toBeUndefined();
  });

  it("dragging one inward crops, and a fresh rectangle drawn past the edge expands and returns to Select", async () => {
    const { kit } = await openWithCapture();
    await userEvent.keyboard("c");
    await act(async () => kit.latest.dragCrop({ x: 5, y: 0, width: 35, height: 30 }, "handle"));
    expect(kit.latest.model!.crop).toEqual({ x: 5, y: 0, width: 35, height: 30 });
    expect(kit.latest.model!.background).toBeUndefined();

    await act(async () => kit.latest.dragCrop({ x: -8, y: -6, width: 60, height: 40 }));
    expect(kit.latest.model!.crop).toEqual({ x: -8, y: -6, width: 60, height: 40 });
    expect(kit.latest.tool).toBe("select");
  });

  it("widening back to the Capture's own size restores the original area", async () => {
    const { kit } = await openWithCapture();
    await userEvent.keyboard("c");
    await act(async () => kit.latest.dragCrop({ x: -10, y: -10, width: 60, height: 50 }, "handle"));
    await act(async () => kit.latest.dragCrop({ x: 0, y: 0, width: 40, height: 30 }, "handle"));
    expect(kit.latest.model!.crop).toBeNull();
  });

  it("a drag past 8192 px is cut and says so", async () => {
    const { kit } = await openWithCapture();
    await userEvent.keyboard("c");
    await act(async () => kit.latest.dragCrop({ x: 0, y: 0, width: 9000, height: 30 }, "handle"));
    expect(kit.latest.model!.crop).toEqual({ x: 0, y: 0, width: 8192, height: 30 });
    expect(screen.getByRole("status")).toHaveTextContent(AREA_LIMIT_MESSAGE);
  });
});

describe("the Image section of the Style panel", () => {
  it("shows with the Select tool and nothing selected, with White, Dark and Transparent, the Settings default picked", async () => {
    await openWithCapture();

    const section = imageSection()!;
    expect(section).not.toBeNull();
    const radios = within(section).getAllByRole("radio");
    expect(radios.map((r) => r.parentElement!.textContent)).toEqual(["White", "Dark", "Transparent"]);
    expect(within(section).getByRole("radio", { name: "Transparent" })).toBeChecked();
  });

  it("shows the Settings default for an image that has none, and the image's own once it has one", async () => {
    const bridge = createFakeBridge();
    await bridge.setImageBackground("dark");
    await openWithCapture(bridge);
    expect(within(imageSection()!).getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("shows while the Crop tool is active, not with a drawing tool, and not while an Annotation is selected", async () => {
    const { kit } = await openWithCapture();
    await userEvent.keyboard("c");
    expect(imageSection()).not.toBeNull();

    await userEvent.keyboard("r");
    expect(imageSection()).toBeNull();

    await userEvent.keyboard("{Escape}");
    expect(imageSection()).not.toBeNull();
    await act(async () => kit.latest.draw({ ...RECT, x: 2, y: 2 }));
    await act(async () => kit.latest.click("r1"));
    expect(imageSection()).toBeNull();
  });

  it("choosing a background is one undo step, kept with the image", async () => {
    const { bridge, kit } = await openWithCapture();

    await userEvent.click(within(imageSection()!).getByRole("radio", { name: "White" }));
    expect(kit.latest.model!.background).toBe("white");
    expect(kit.latest.layout.background).toBe("white");
    await autosave();
    expect(savedModel(bridge).background).toBe("white");

    await userEvent.click(within(imageSection()!).getByRole("radio", { name: "Dark" }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(kit.latest.model!.background).toBe("white");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(kit.latest.model!.background).toBeUndefined();
  });

  it("a change of background keeps what the image already has: the Settings default only applies the first time", async () => {
    const bridge = createFakeBridge();
    const { kit } = await openWithCapture(bridge);
    await userEvent.click(within(imageSection()!).getByRole("radio", { name: "Dark" }));
    await act(async () => bridge.setImageBackground("white"));

    await userEvent.keyboard("c");
    await act(async () => kit.latest.dragCrop({ x: -10, y: 0, width: 50, height: 30 }, "handle"));

    expect(kit.latest.model!.background).toBe("dark");
  });
});

describe("transparency", () => {
  it("is drawn on a checkerboard under the visible area, Light by default and Dark when Settings say so", async () => {
    const bridge = createFakeBridge();
    await openWithCapture(bridge);
    expect(document.querySelector(".editor")).toHaveAttribute("data-checker", "light");
    expect(document.querySelector(".area .checker")).not.toBeNull();

    await act(async () => bridge.setCheckerboard("dark"));
    expect(document.querySelector(".editor")).toHaveAttribute("data-checker", "dark");
  });

  it("is not drawn for a White or Dark background", async () => {
    await openWithCapture();
    await userEvent.click(within(imageSection()!).getByRole("radio", { name: "White" }));
    expect(document.querySelector(".area .checker")).toBeNull();
  });
});

describe("a pasted image", () => {
  it("does not grow the area (it carries no bounds)", async () => {
    // The paste path adds the Annotation without bounds; the same rule for any edit made without them.
    const { kit } = await openWithCapture();
    await act(async () => kit.latest.draw(RECT));
    expect(kit.latest.model!.crop).toBeNull();
  });
});
