// Line, Rectangle and Ellipse in the editor: shortcuts, the shared Stroke and Fill groups, restyling a
// selection, and each tool remembering its last style across restarts (stored through the bridge).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import type { EllipseAnnotation, LineAnnotation, RectAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

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
const ELLIPSE: EllipseAnnotation = { ...RECT, id: "e1", type: "ellipse" };
const LINE: LineAnnotation = {
  id: "l1",
  type: "line",
  x1: 0,
  y1: 0,
  x2: 2,
  y2: 1,
  stroke: { color: "#e02424", width: 4 },
};

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openEditor(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  const view = render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  return { kit, view };
}

async function capture(bridge: FakeBridge) {
  const before = bridge.libraryFiles.length;
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15, 13, 45, 1) }));
  await waitFor(() => expect(bridge.libraryFiles).toHaveLength(before + 1));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
}

const savedModel = (bridge: FakeBridge) => decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model;
const autosave = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
const userDraws = async (kit: StubKit, annotation: RectAnnotation | EllipseAnnotation | LineAnnotation) => {
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  await act(async () => kit.latest.draw(annotation));
};

describe("tools and shortcut keys", () => {
  it("shows Line, Rectangle and Ellipse in the tool column with their keys", async () => {
    await openEditor(createFakeBridge());

    const tools = screen.getByRole("navigation", { name: "Tools" });
    expect(tools).toHaveTextContent(/Line\s*L/);
    expect(tools).toHaveTextContent(/Rectangle\s*R/);
    expect(tools).toHaveTextContent(/Ellipse\s*E/);
  });

  it.each([
    ["l", "line"],
    ["r", "rect"],
    ["e", "ellipse"],
  ])("%s picks the %s tool", async (key, tool) => {
    const bridge = createFakeBridge();
    const { kit } = await openEditor(bridge);
    await capture(bridge);

    await userEvent.keyboard(key);

    await waitFor(() => expect(kit.latest.tool).toBe(tool));
  });
});

describe("Style panel groups", () => {
  it("shows Stroke and Fill for a Rectangle and an Ellipse, Stroke only for a Line", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge);

    await userEvent.keyboard("r");
    expect(screen.getByRole("region", { name: "Stroke" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Fill" })).toBeVisible();
    await userEvent.keyboard("e");
    expect(screen.getByRole("region", { name: "Fill" })).toBeVisible();
    await userEvent.keyboard("l");
    expect(screen.getByRole("region", { name: "Stroke" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Fill" })).toBeNull();
  });

  it("draws in the tool's style, which the panel edits before anything is drawn", async () => {
    const bridge = createFakeBridge();
    const { kit } = await openEditor(bridge);
    await capture(bridge);
    await userEvent.keyboard("r");

    await userEvent.click(screen.getByRole("button", { name: "Thickness 8" }));
    await userEvent.click(screen.getByRole("button", { name: "Solid" }));

    expect(kit.latest.drawStyle).toMatchObject({
      stroke: { color: "#e02424", width: 8 },
      fill: { mode: "solid" },
    });
  });
});

describe("restyling a selected Annotation", () => {
  it("sets the Fill of a Rectangle: none, solid, semi-transparent with its opacity, and a color", async () => {
    const bridge = createFakeBridge();
    const { kit } = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit, RECT);

    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("slider", { name: "Fill opacity" })).toBeNull(); // only for semi-transparent

    await userEvent.click(screen.getByRole("button", { name: "Solid" }));
    await userEvent.click(screen.getByRole("button", { name: "Fill color #2563eb" }));
    await autosave();
    expect(savedModel(bridge).annotations[0]).toMatchObject({ fill: { mode: "solid", color: "#2563eb" } });

    await userEvent.click(screen.getByRole("button", { name: "Semi-transparent" }));
    fireEvent.change(screen.getByRole("slider", { name: "Fill opacity" }), { target: { value: "25" } });
    await autosave();
    expect(savedModel(bridge).annotations[0]).toMatchObject({ fill: { mode: "semi", color: "#2563eb", opacity: 0.25 } });

    await userEvent.click(screen.getByRole("button", { name: "None" }));
    await autosave();
    expect(savedModel(bridge).annotations[0]).toMatchObject({ fill: { mode: "none", color: "#2563eb" } });
  });

  it("restyles stroke and fill of an Ellipse with the same panel, leaving its box alone", async () => {
    const bridge = createFakeBridge();
    const { kit } = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit, ELLIPSE);

    await userEvent.click(screen.getByRole("button", { name: "Color #16a34a" }));
    await userEvent.click(screen.getByRole("button", { name: "Solid" }));
    await autosave();

    expect(savedModel(bridge).annotations).toEqual([
      { ...ELLIPSE, stroke: { color: "#16a34a", width: 4 }, fill: { mode: "solid", color: "#facc15", opacity: 0.4 } },
    ]);
  });

  it("restyles a Line's stroke only", async () => {
    const bridge = createFakeBridge();
    const { kit } = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit, LINE);

    await userEvent.click(screen.getByRole("button", { name: "Thickness 2" }));
    await autosave();

    expect(savedModel(bridge).annotations).toEqual([{ ...LINE, stroke: { color: "#e02424", width: 2 } }]);
  });
});

describe("sticky tool styles", () => {
  it("are stored in the settings as soon as a tool is restyled (after a short pause)", async () => {
    const bridge = createFakeBridge();
    const { kit } = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit, RECT);

    await userEvent.click(screen.getByRole("button", { name: "Color #9333ea" }));
    await userEvent.click(screen.getByRole("button", { name: "Semi-transparent" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));

    expect(bridge.toolStyles).toMatchObject({
      rect: { stroke: { color: "#9333ea", width: 4 }, fill: { mode: "semi" } },
    });
    expect(bridge.toolStyles).not.toHaveProperty("ellipse"); // each tool has its own
  });

  it("come back after a restart: a new Editor draws with what the tool had", async () => {
    const bridge = createFakeBridge();
    const first = await openEditor(bridge);
    await capture(bridge);
    await userEvent.keyboard("l");
    await userEvent.click(screen.getByRole("button", { name: "Thickness 8" }));
    await userEvent.click(screen.getByRole("button", { name: "Color #2563eb" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    first.view.unmount();

    const second = await openEditor(bridge); // same settings, new process
    await capture(bridge);
    await userEvent.keyboard("l");

    await waitFor(() =>
      expect(second.kit.latest.drawStyle).toEqual({ stroke: { color: "#2563eb", width: 8 } }),
    );
    expect(screen.getByRole("button", { name: "Thickness 8" })).toHaveAttribute("aria-pressed", "true");
    // another tool is unaffected
    await userEvent.keyboard("r");
    expect(screen.getByRole("button", { name: "Thickness 4" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignore what is unreadable in the stored styles and keep the rest", async () => {
    const bridge = createFakeBridge();
    await bridge.setToolStyles({
      rect: { stroke: { color: "not a color", width: 99 }, fill: { mode: "solid", color: "#16a34a", opacity: 1 } },
      line: "garbage",
    });
    const { kit } = await openEditor(bridge);
    await capture(bridge);

    await userEvent.keyboard("r");
    await waitFor(() => expect(kit.latest.drawStyle.fill).toMatchObject({ mode: "solid", color: "#16a34a" }));
    expect(kit.latest.drawStyle.stroke).toEqual({ color: "#e02424", width: 4 });
    await userEvent.keyboard("l");
    expect(kit.latest.drawStyle).toEqual({ stroke: { color: "#e02424", width: 4 } });
  });

  it("do not overwrite the stored styles of other tools (or newer versions) when one tool changes", async () => {
    const bridge = createFakeBridge();
    await bridge.setToolStyles({ text: { font: { family: "x" } }, ellipse: { stroke: { color: "#16a34a", width: 8 } } });
    await openEditor(bridge);
    await capture(bridge);

    await userEvent.keyboard("r");
    await userEvent.click(screen.getByRole("button", { name: "Thickness 2" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));

    expect(bridge.toolStyles).toMatchObject({
      text: { font: { family: "x" } },
      ellipse: { stroke: { color: "#16a34a", width: 8 } },
      rect: { stroke: { width: 2 } },
    });
  });

  it("show the Fill group's current mode in the panel for a stored style", async () => {
    const bridge = createFakeBridge();
    await bridge.setToolStyles({ ellipse: { fill: { mode: "semi", color: "#16a34a", opacity: 0.6 } } });
    await openEditor(bridge);
    await capture(bridge);

    await userEvent.keyboard("e");

    const fill = await screen.findByRole("region", { name: "Fill" });
    await waitFor(() => expect(within(fill).getByRole("button", { name: "Semi-transparent" })).toHaveAttribute("aria-pressed", "true"));
    expect(within(fill).getByRole("slider", { name: "Fill opacity" })).toHaveValue("60");
  });
});
