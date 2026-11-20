// Selecting several Annotations at once (the Select tool's rubber band): what the editor does with a multi-selection.
// Stub canvas; the real-Fabric run is e2e/multiSelect.spec.ts.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import type { RectAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
const rect = (id: string, x: number): RectAnnotation => ({
  id,
  type: "rect",
  x,
  y: 0,
  width: 2,
  height: 1,
  stroke: { color: "#e02424", width: 4 },
  fill: { mode: "none", color: "#facc15", opacity: 0.4 },
});

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openWithThreeRects(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  await userEvent.keyboard("r");
  for (const [id, x] of [["a", 0], ["b", 10], ["c", 20]] as const) await act(async () => kit.latest.draw(rect(id, x)));
  await userEvent.keyboard("v");
  return kit;
}
const ids = (kit: StubKit) => kit.latest.model!.annotations.map((a) => a.id);

describe("a multi-selection", () => {
  it("is reported by the canvas and shown in the Style panel, which has no style for several at once", async () => {
    const kit = await openWithThreeRects(createFakeBridge());
    await act(async () => kit.latest.clickMany(["a", "b"]));

    expect(kit.latest.selectedIds).toEqual(["a", "b"]);
    expect(screen.getByText("2 Annotations selected. Drag one to move them all, or press Delete to remove them.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Stroke" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Arrange" })).toBeNull();
  });

  it("is moved as one Undo step", async () => {
    const kit = await openWithThreeRects(createFakeBridge());
    await act(async () => kit.latest.clickMany(["a", "b"]));

    await act(async () =>
      kit.latest.editMany([
        { id: "a", patch: { x: 5 } },
        { id: "b", patch: { x: 15 } },
      ]),
    );
    const xs = () => kit.latest.model!.annotations.map((a) => (a as RectAnnotation).x);
    expect(xs()).toEqual([5, 15, 20]);

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(xs()).toEqual([0, 10, 20]); // both back at once
  });

  it("is deleted by Delete, all at once and in one Undo step, leaving the rest", async () => {
    const kit = await openWithThreeRects(createFakeBridge());
    await act(async () => kit.latest.clickMany(["a", "c"]));

    await userEvent.keyboard("{Delete}");
    expect(ids(kit)).toEqual(["b"]);
    expect(kit.latest.selectedIds).toEqual([]);

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(ids(kit)).toEqual(["a", "b", "c"]);
  });

  it("makes Ctrl+C do nothing special: the image is not copied while Annotations are selected", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithThreeRects(bridge);
    await act(async () => kit.latest.clickMany(["a", "b"]));
    await userEvent.keyboard("{Control>}c{/Control}");
    expect(bridge.copiedImages).toHaveLength(0);
  });

  it("shrinks to one selected Annotation when the others are deleted by Undo", async () => {
    const kit = await openWithThreeRects(createFakeBridge());
    await act(async () => kit.latest.clickMany(["b", "c"]));
    await userEvent.keyboard("{Control>}z{/Control}"); // undoes the creation of "c"
    expect(ids(kit)).toEqual(["a", "b"]);
    expect(kit.latest.selectedIds).toEqual(["b"]);
  });
});
