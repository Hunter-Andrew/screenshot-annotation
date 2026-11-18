// The M4 settings the editor reads: the Crop margin (the view re-fits to it while the Crop tool is on), the Dark
// image background colour (applied when drawing, never stored), and the collapsible Library Strip.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = Array.from({ length: 40 * 30 }, () => [10, 20, 30, 255]).flat();

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function open(bridge: FakeBridge = createFakeBridge()) {
  const kit: StubKit = createStubKit();
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 40, height: 30, rgba: PIXELS, capturedAt: new Date(2026, 10, 15, 13, 45, 1) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  return { bridge, kit };
}
const pad = () => document.querySelector<HTMLElement>(".stage-pad")!;
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(400)));

describe("Canvas margin during crop", () => {
  it("is the margin around the canvas only while the Crop tool is on, and the view returns to the Canvas margin after", async () => {
    const bridge = createFakeBridge();
    await bridge.setCropMargin(120);
    await open(bridge);
    expect(pad().style.padding).toBe("16px");
    await userEvent.keyboard("c");
    await settle();
    expect(pad().style.padding).toBe("120px");
    await userEvent.keyboard("v");
    await settle();
    expect(pad().style.padding).toBe("16px");
  });

  it("a change of the setting while cropping is taken at once", async () => {
    const { bridge } = await open();
    await userEvent.keyboard("c");
    await settle();
    expect(pad().style.padding).toBe("150px");
    await act(async () => bridge.setCropMargin(0));
    expect(pad().style.padding).toBe("0px");
  });

  it("glides: the margin is between the two values part-way through the change", async () => {
    await open();
    await userEvent.keyboard("c");
    await act(async () => void (await vi.advanceTimersByTimeAsync(60)));
    const mid = parseInt(pad().style.padding, 10);
    expect(mid).toBeGreaterThan(16);
    expect(mid).toBeLessThan(150);
    await settle();
    expect(pad().style.padding).toBe("150px");
  });
});

describe("Dark image background", () => {
  it("is the setting's colour on the canvas and in what the renderer is given, and follows a change", async () => {
    const bridge = createFakeBridge();
    await bridge.setImageBackground("dark");
    const { kit } = await open(bridge);
    expect(kit.latest.layout.darkBackground).toBe("#191919");
    await act(async () => bridge.setDarkBackground("#336699"));
    expect(kit.latest.layout.darkBackground).toBe("#336699");

    const seen: (string | undefined)[] = [];
    kit.render = async (image, options) => {
      seen.push(options?.darkBackground);
      return image.capture;
    };
    await act(async () => kit.latest.dragCrop({ x: 5, y: 5, width: 20, height: 20 })); // a Crop makes the export draw
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(seen).toEqual(["#336699"]));
  });

  it("the fake bridge refuses anything but #RRGGBB", async () => {
    const bridge = createFakeBridge();
    for (const bad of ["", "336699", "#36", "#gggggg", "red"]) await expect(bridge.setDarkBackground(bad)).rejects.toThrow();
    await bridge.setDarkBackground("#ABCDEF");
    expect((await bridge.getImageSettings()).darkBackground).toBe("#abcdef");
  });
});

describe("Library Strip collapse", () => {
  it("the chevron collapses the strip to a thin bar and expands it again, and the choice is kept", async () => {
    const bridge = createFakeBridge();
    const { unmount } = render(<Editor bridge={bridge} kit={createStubKit()} />);
    await act(async () => {});
    const strip = screen.getByRole("region", { name: "Library Strip" });
    expect(strip).toHaveAttribute("data-collapsed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Collapse Library Strip" }));
    expect(strip).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByRole("button", { name: /All captures/ })).toBeNull();
    expect(bridge.imageSettings.libraryStripCollapsed).toBe(true);
    unmount();

    render(<Editor bridge={bridge} kit={createStubKit()} />);
    await act(async () => {});
    expect(await screen.findByRole("button", { name: "Expand Library Strip" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Expand Library Strip" }));
    expect(screen.getByRole("region", { name: "Library Strip" })).toHaveAttribute("data-collapsed", "false");
    expect(bridge.imageSettings.libraryStripCollapsed).toBe(false);
  });
});
