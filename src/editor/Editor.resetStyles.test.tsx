// Settings > Reset tool styles (ticket 23): the editor is a different window that already holds the
// sticky styles in memory, so the reset has to reach it while it is loaded (pre-warmed, ADR 0003).
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openWithCapture(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15, 13, 45, 1) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  return kit;
}

const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(500)));

describe("Reset tool styles reaches a loaded editor", () => {
  it("the next shape starts from the tool's default again, not from the style it had", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await userEvent.keyboard("l");
    await userEvent.click(screen.getByRole("button", { name: "Thickness 8" }));
    await userEvent.click(screen.getByRole("button", { name: "Color #2563eb" }));
    await settle();
    expect(kit.latest.drawStyle).toEqual({ stroke: { color: "#2563eb", width: 8 } });

    await act(async () => bridge.resetToolStyles());

    await waitFor(() => expect(kit.latest.drawStyle).toEqual({ stroke: { color: "#e02424", width: 4 } }));
    expect(screen.getByRole("button", { name: "Thickness 4" })).toHaveAttribute("aria-pressed", "true");
  });

  it("forgets the 'return to Select' choices too", async () => {
    const bridge = createFakeBridge();
    await bridge.setToolStyles({ toolBehavior: { pen: true, rect: false } });
    await openWithCapture(bridge);
    await userEvent.keyboard("p");
    const option = () => screen.getByRole("checkbox", { name: "Return to Select after drawing" });
    expect(option()).toBeChecked();

    await act(async () => bridge.resetToolStyles());

    await waitFor(() => expect(option()).not.toBeChecked()); // the Pen default: stays
    await userEvent.keyboard("r");
    expect(option()).toBeChecked(); // the Rectangle default: returns
  });

  it("does not write the old styles back afterwards, and later changes are stored fresh", async () => {
    const bridge = createFakeBridge();
    await openWithCapture(bridge);
    await userEvent.keyboard("l");
    await userEvent.click(screen.getByRole("button", { name: "Thickness 8" }));
    // Reset inside the 300 ms before that change is written: it must not be written afterwards.
    await act(async () => bridge.resetToolStyles());
    await settle();
    expect(bridge.toolStyles).toEqual({});

    await userEvent.click(screen.getByRole("button", { name: "Thickness 2" }));
    await settle();
    expect(bridge.toolStyles).toEqual({ line: expect.objectContaining({ stroke: expect.objectContaining({ width: 2 }) }) });
  });
});
