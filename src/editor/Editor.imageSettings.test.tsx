import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

// The editor takes the image settings (callout tail percentage, canvas margin, outside darkness, show-outside default)
// like the background and the checkerboard: once from the getter, then on every change from any window. Stub canvas.

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function open(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  return kit;
}

describe("the callout tail percentage", () => {
  it("is 20 until Settings say otherwise, and follows a change made in the Settings window", async () => {
    const bridge = createFakeBridge();
    const kit = await open(bridge);
    await waitFor(() => expect(kit.latest.calloutTailPercent).toBe(20));

    await act(async () => bridge.setCalloutTailPercent(35));
    expect(kit.latest.calloutTailPercent).toBe(35);
    expect(bridge.imageSettings.calloutTailPercent).toBe(35);
  });

  it("starts from what was stored earlier", async () => {
    const bridge = createFakeBridge();
    await bridge.setCalloutTailPercent(45);
    const kit = await open(bridge);
    await waitFor(() => expect(kit.latest.calloutTailPercent).toBe(45));
  });
});

describe("the other image settings", () => {
  it("reach the editor through the same getter and event, and a value outside its range is refused", async () => {
    const bridge = createFakeBridge();
    const seen: unknown[] = [];
    await bridge.onImageSettings((settings) => seen.push(settings));
    await bridge.setCanvasMargin(100);
    await bridge.setOutsideDarkness(80);
    await bridge.setShowOutsideDefault(false);
    expect(await bridge.getImageSettings()).toMatchObject({ canvasMargin: 100, outsideDarkness: 80, showOutsideDefault: false });
    expect(seen).toHaveLength(3);

    await expect(bridge.setCanvasMargin(5)).rejects.toThrow();
    await expect(bridge.setOutsideDarkness(96)).rejects.toThrow();
    await expect(bridge.setCalloutTailPercent(4)).rejects.toThrow();
    expect(seen).toHaveLength(3);
  });
});
