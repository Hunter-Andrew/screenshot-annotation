// The Pen's Eraser mode in the editor: the Mode group and Eraser size in the Style panel (for the active tool
// only), their stickiness, and one erase drag being one undo step. Stub canvas; the real-Fabric run is
// e2e/eraser.spec.ts.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import type { Annotation, PenAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = new Array(100 * 100 * 4).fill(255);
const pen = (id: string, xs: number[], y = 50): PenAnnotation => ({
  id,
  type: "pen",
  points: xs.map((x) => ({ x, y })),
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
  await act(async () => bridge.simulateCapture({ width: 100, height: 100, rgba: PIXELS as never, capturedAt: new Date(2026, 10, 15) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  return { kit, view };
}

const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(500)));
const mode = () => screen.queryByRole("region", { name: "Mode" });
const annotations = (kit: StubKit): Annotation[] => kit.latest.model!.annotations;
const drawn = async (kit: StubKit, ...strokes: Annotation[]) => {
  for (const stroke of strokes) await act(async () => kit.latest.draw(stroke));
};

describe("the Mode group in the Pen tool's Style panel", () => {
  it("is the first group, with Pen pressed, Eraser, and an Eraser size of 20 px", async () => {
    await openWithCapture(createFakeBridge());
    await userEvent.keyboard("p");

    const panel = screen.getByRole("complementary", { name: "Style" });
    const groups = within(panel).getAllByRole("region");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Mode", "Stroke"]);
    expect(within(mode()!).getByRole("button", { name: "Pen" })).toHaveAttribute("aria-pressed", "true");
    expect(within(mode()!).getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "false");
    expect(within(mode()!).getByRole("slider", { name: "Eraser size" })).toHaveValue("20");
    expect(within(mode()!).getByRole("spinbutton", { name: "Eraser size number" })).toHaveValue(20);
  });

  it("tells the canvas the mode and size, and takes the size from the slider's range 4 to 100 only", async () => {
    const { kit } = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("p");
    expect(kit.latest.drawStyle.eraser).toEqual({ mode: "pen", size: 20 });

    await userEvent.click(within(mode()!).getByRole("button", { name: "Eraser" }));
    expect(kit.latest.drawStyle.eraser).toEqual({ mode: "eraser", size: 20 });

    const box = within(mode()!).getByRole("spinbutton", { name: "Eraser size number" });
    await userEvent.clear(box);
    await userEvent.type(box, "60");
    expect(kit.latest.drawStyle.eraser).toEqual({ mode: "eraser", size: 60 });
    fireEvent.change(box, { target: { value: "500" } }); // out of range: not taken
    expect(kit.latest.drawStyle.eraser).toEqual({ mode: "eraser", size: 60 });
    expect(within(mode()!).getByRole("slider", { name: "Eraser size" })).toHaveAttribute("min", "4");
    expect(within(mode()!).getByRole("slider", { name: "Eraser size" })).toHaveAttribute("max", "100");
  });

  it("is not offered for the other tools, nor for a selected Pen stroke, which shows Stroke only", async () => {
    const { kit } = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("r");
    expect(mode()).toBeNull();

    await userEvent.keyboard("p");
    await userEvent.click(within(mode()!).getByRole("button", { name: "Eraser" }));
    await drawn(kit, pen("s1", [10, 40, 80]));
    await userEvent.keyboard("v");
    await act(async () => kit.latest.click("s1"));

    expect(screen.getByRole("region", { name: "Stroke" })).toBeVisible();
    expect(mode()).toBeNull();
    // Restyling the selected stroke changes the stroke, and never gives it an eraser setting.
    await userEvent.click(screen.getByRole("button", { name: "Thickness 8" }));
    const [stroke] = annotations(kit) as PenAnnotation[];
    expect(stroke!.stroke.width).toBe(8);
    expect(stroke).not.toHaveProperty("eraser");
  });

  it("is remembered with the Pen's style: stored in the tool styles, and still chosen in a new Editor", async () => {
    const bridge = createFakeBridge();
    const first = await openWithCapture(bridge);
    await userEvent.keyboard("p");
    await userEvent.click(within(mode()!).getByRole("button", { name: "Eraser" }));
    const box = within(mode()!).getByRole("spinbutton", { name: "Eraser size number" });
    await userEvent.clear(box);
    await userEvent.type(box, "35");
    await settle();
    expect(bridge.toolStyles).toMatchObject({ pen: { eraser: { mode: "eraser", size: 35 } } });
    first.view.unmount();

    const second = await openWithCapture(bridge);
    await userEvent.keyboard("p");
    expect(within(mode()!).getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "true");
    expect(within(mode()!).getByRole("spinbutton", { name: "Eraser size number" })).toHaveValue(35);
    expect(second.kit.latest.drawStyle.eraser).toEqual({ mode: "eraser", size: 35 });
  });

  it("falls back to Pen mode and 20 px for a settings file with no (or a broken) eraser value", async () => {
    const bridge = createFakeBridge();
    await bridge.setToolStyles({ pen: { stroke: { color: "#2563eb", width: 8 }, eraser: { mode: "smudge", size: 9000 } } });
    await openWithCapture(bridge);
    await userEvent.keyboard("p");

    expect(within(mode()!).getByRole("button", { name: "Pen" })).toHaveAttribute("aria-pressed", "true");
    expect(within(mode()!).getByRole("spinbutton", { name: "Eraser size number" })).toHaveValue(20);
  });
});

describe("an erase drag is one undo step", () => {
  const eraseAcross = (kit: StubKit) => act(async () => kit.latest.erase([{ x: 50, y: 0 }, { x: 50, y: 100 }], 10));

  it("cuts every Pen stroke it crossed, leaves the Highlighter alone, and Undo and Redo take it back and forward whole", async () => {
    const { kit } = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("p");
    const highlight: Annotation = {
      id: "h",
      type: "highlight",
      points: [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      stroke: { color: "#facc15", width: 16 },
      opacity: { value: 0.4 },
    };
    await drawn(kit, pen("a", [0, 25, 50, 75, 100], 20), highlight, pen("b", [0, 25, 50, 75, 100], 70));
    const undoSteps = () => (screen.getByRole("button", { name: /^Undo/ }) as HTMLButtonElement).disabled;
    const before = annotations(kit);

    await eraseAcross(kit);

    const after = annotations(kit);
    expect(after.filter((a) => a.type === "pen")).toHaveLength(4); // a and b each cut in two
    expect(after.find((a) => a.id === "h")).toEqual(highlight);
    expect(kit.latest.tool).toBe("pen"); // the Pen stays on its tool

    await userEvent.click(screen.getByRole("button", { name: /^Undo/ })); // ONE click
    expect(annotations(kit)).toEqual(before.slice(0, 3));
    await userEvent.click(screen.getByRole("button", { name: /^Redo/ }));
    expect(annotations(kit)).toEqual(after);
    expect(undoSteps()).toBe(false);
  });

  it("makes no step, and no change, when the eraser touched nothing", async () => {
    const { kit } = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("p");
    await drawn(kit, pen("a", [0, 20], 20));
    const model = kit.latest.model;

    await act(async () => kit.latest.erase([{ x: 90, y: 90 }], 10));
    expect(kit.latest.model).toBe(model);
    await userEvent.click(screen.getByRole("button", { name: /^Undo/ }));
    expect(annotations(kit)).toEqual([]); // that undid the drawing, not an erase
  });

  it("is saved in the history file and comes back from it (the new edit kinds serialise)", async () => {
    const bridge = createFakeBridge();
    const first = await openWithCapture(bridge);
    await userEvent.keyboard("p");
    await drawn(first.kit, pen("a", [0, 25, 50, 75, 100], 20), pen("b", [0, 25, 50, 75, 100], 70));
    await eraseAcross(first.kit);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000))); // autosave
    first.view.unmount();

    // A restart: the newest Library image opens again with its stored history.
    const kit = createStubKit();
    render(<Editor bridge={bridge} kit={kit} />);
    await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
    await waitFor(() => expect(annotations(kit)).toHaveLength(4));
    await userEvent.click(screen.getByRole("button", { name: /^Undo/ }));
    expect(annotations(kit).map((a) => a.id)).toEqual(["a", "b"]);
  });
});
