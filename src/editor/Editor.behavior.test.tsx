// "Return to Select after drawing", per tool: defaults, the Style panel checkbox (about the ACTIVE TOOL),
// and the choice being sticky through the settings. Stub canvas; the real-Fabric run is e2e/behavior.spec.ts.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import type { PenAnnotation, RectAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
const rect = (id: string): RectAnnotation => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 2,
  height: 1,
  stroke: { color: "#e02424", width: 4 },
  fill: { mode: "none", color: "#facc15", opacity: 0.4 },
});
const pen = (id: string): PenAnnotation => ({
  id,
  type: "pen",
  points: [
    { x: 0, y: 0 },
    { x: 2, y: 1 },
  ],
  stroke: { color: "#e02424", width: 4 },
});

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openWithCapture(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  const view = render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  return { kit, view };
}

const toolButton = (name: RegExp) => screen.getByRole("button", { name });
const option = () => screen.queryByRole("checkbox", { name: "Return to Select after drawing" });
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(500)));

describe("return to Select after drawing", () => {
  it("by default the Pen keeps drawing: a second stroke needs no re-picking of the tool", async () => {
    const { kit } = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("p");

    await act(async () => kit.latest.draw(pen("p1")));
    expect(toolButton(/^Pen/)).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.tool).toBe("pen");
    await act(async () => kit.latest.draw(pen("p2")));

    expect(toolButton(/^Pen/)).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.selected).toBeNull();
    expect(option()).not.toBeChecked();
  });

  it("by default a Rectangle (like the other shapes and Text) returns to Select with the new one selected", async () => {
    const { kit } = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("r");
    expect(option()).toBeChecked();

    await act(async () => kit.latest.draw(rect("r1")));

    expect(toolButton(/^Select/)).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.selected).toBe("r1");
  });

  it("the checkbox is at the top of the Style panel, for a drawing tool only, and is about the tool not the selection", async () => {
    const { kit } = await openWithCapture(createFakeBridge());
    expect(option()).toBeNull(); // Select tool, nothing selected

    await userEvent.keyboard("r");
    const panel = screen.getByRole("complementary", { name: "Style" });
    expect(panel.querySelector("input[type=checkbox]")).toBe(option()); // the first control in the panel

    await act(async () => kit.latest.draw(rect("r1"))); // now Select, with the rectangle selected
    expect(screen.getByRole("region", { name: "Stroke" })).toBeVisible();
    expect(option()).toBeNull();
  });

  it("turning it off for the Rectangle keeps the tool; turning it on for the Pen switches back", async () => {
    const { kit } = await openWithCapture(createFakeBridge());

    await userEvent.keyboard("r");
    await userEvent.click(option()!);
    await act(async () => kit.latest.draw(rect("r1")));
    expect(toolButton(/^Rectangle/)).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.selected).toBeNull();

    await userEvent.keyboard("p");
    expect(option()).not.toBeChecked(); // each tool has its own
    await userEvent.click(option()!);
    await act(async () => kit.latest.draw(pen("p1")));
    expect(toolButton(/^Select/)).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.selected).toBe("p1");
  });

  it("Esc still returns to Select even when the tool stays", async () => {
    const { kit } = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("p");
    await act(async () => kit.latest.draw(pen("p1")));

    await userEvent.keyboard("{Escape}");

    expect(toolButton(/^Select/)).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.tool).toBe("select");
  });
});

describe("the choice is sticky", () => {
  it("is stored with the tool styles, and a new Editor on the same settings remembers it", async () => {
    const bridge = createFakeBridge();
    const first = await openWithCapture(bridge);
    await userEvent.keyboard("p");
    await userEvent.click(option()!); // Pen: now returns to Select
    await userEvent.keyboard("r");
    await userEvent.click(option()!); // Rectangle: now stays
    await settle();
    expect(bridge.toolStyles).toMatchObject({ toolBehavior: { pen: true, rect: false } });
    first.view.unmount();

    const second = await openWithCapture(bridge);
    await userEvent.keyboard("p");
    expect(option()).toBeChecked();
    await userEvent.keyboard("r");
    expect(option()).not.toBeChecked();
    await act(async () => second.kit.latest.draw(rect("r9")));
    expect(toolButton(/^Rectangle/)).toHaveAttribute("aria-pressed", "true");
  });

  it("an old settings file without it falls back to the defaults; garbage values and unknown keys are tolerated and written back untouched", async () => {
    const bridge = createFakeBridge();
    await bridge.setToolStyles({ rect: { stroke: { color: "#2563eb", width: 8 } }, futureTool: { x: 1 }, toolBehavior: { pen: "maybe", text: false } });
    await openWithCapture(bridge);

    await userEvent.keyboard("p");
    expect(option()).not.toBeChecked(); // "maybe" is ignored: the Pen default
    await userEvent.keyboard("t");
    expect(option()).not.toBeChecked(); // a valid stored false for Text

    await userEvent.keyboard("r");
    await userEvent.click(option()!);
    await settle();
    expect(bridge.toolStyles).toMatchObject({
      rect: { stroke: { color: "#2563eb", width: 8 } },
      futureTool: { x: 1 },
      toolBehavior: { text: false, rect: false },
    });
  });
});
