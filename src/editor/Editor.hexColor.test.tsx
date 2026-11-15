// The hex field of every Style panel color, inside the real Editor with the stub canvas: it restyles
// through the same path as the palette (so undo, auto-save and sticky styles see it), follows the
// selection and undo, and typing in it never reaches the tool shortcuts.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import type { RectAnnotation } from "../core/annotation";
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
  fill: { mode: "solid", color: "#facc15", opacity: 0.4 },
};
const OTHER: RectAnnotation = { ...RECT, id: "r2", stroke: { color: "#2563eb", width: 4 }, fill: { ...RECT.fill, color: "#16a34a" } };

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openEditor(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  return kit;
}
async function capture(bridge: FakeBridge) {
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15, 13, 45, 1) }));
  await waitFor(() => expect(bridge.libraryFiles).toHaveLength(1));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
}
const savedModel = (bridge: FakeBridge) => decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model;
const autosave = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
const draw = async (kit: StubKit, annotation: RectAnnotation) => {
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  await act(async () => kit.latest.draw(annotation));
};
async function typeHex(name: string, text: string) {
  const field = screen.getByRole("textbox", { name });
  await userEvent.clear(field);
  await userEvent.type(field, `${text}{Enter}`);
  return field;
}

describe("hex field in the Style panel", () => {
  it("every color control has one: stroke, fill (when shown), font color and text outline color", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, RECT);
    expect(screen.getByRole("textbox", { name: "Color hex" })).toHaveValue("#e02424");
    expect(screen.getByRole("textbox", { name: "Fill color hex" })).toHaveValue("#facc15");

    await userEvent.keyboard("t");
    expect(screen.getByRole("textbox", { name: "Text color hex" })).toHaveValue("#e02424");
    expect(screen.getByRole("textbox", { name: "Outline color hex" })).toHaveValue("#ffffff");
  });

  it("restyles the selected stroke and fill from typed hex, normalized to #rrggbb, and saves it", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, RECT);

    await typeHex("Color hex", "2563EB");
    await typeHex("Fill color hex", "#f80");
    await autosave();

    expect(savedModel(bridge).annotations[0]).toMatchObject({
      stroke: { color: "#2563eb", width: 4 },
      fill: { mode: "solid", color: "#ff8800" },
    });
  });

  it("sets the color of the active tool before anything is drawn (sticky style)", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userEvent.keyboard("r");

    await typeHex("Color hex", "#9333ea");

    expect(kit.latest.drawStyle).toMatchObject({ stroke: { color: "#9333ea", width: 4 } });
  });

  it("leaves the color alone for an invalid value", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, RECT);

    const field = await typeHex("Color hex", "#12345");
    expect(field).toHaveAttribute("aria-invalid", "true");
    await userEvent.tab();
    await autosave();

    expect(field).toHaveValue("#e02424");
    expect(savedModel(bridge).annotations[0]).toMatchObject({ stroke: { color: "#e02424" } });
  });

  it("follows the palette, another selection and undo", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, RECT);
    const field = screen.getByRole("textbox", { name: "Color hex" });

    await userEvent.click(screen.getByRole("button", { name: "Color #16a34a" }));
    expect(field).toHaveValue("#16a34a");
    await autosave(); // a pause ends the undo step (quick edits merge into one)

    await typeHex("Color hex", "#9333ea");
    expect(field).toHaveValue("#9333ea");
    (document.activeElement as HTMLElement).blur(); // focus out of the field, like a click on the picture
    await userEvent.keyboard("{Control>}z{/Control}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Color hex" })).toHaveValue("#16a34a"));
    await userEvent.keyboard("{Control>}y{/Control}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Color hex" })).toHaveValue("#9333ea"));

    await draw(kit, OTHER);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Color hex" })).toHaveValue("#2563eb"));
  });

  it("one hex edit is one undo step", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, RECT);

    await typeHex("Color hex", "#9333ea");
    (document.activeElement as HTMLElement).blur();
    await autosave();
    await userEvent.keyboard("{Control>}z{/Control}");
    await autosave();

    expect(savedModel(bridge).annotations[0]).toMatchObject({ stroke: { color: "#e02424" } });
  });

  it("typing in it never triggers a tool shortcut, delete or undo of the picture", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, RECT);
    const before = kit.latest.tool;

    const field = screen.getByRole("textbox", { name: "Color hex" });
    await userEvent.click(field);
    await userEvent.keyboard("{Control>}a{/Control}"); // select all, in the field
    await userEvent.keyboard("realtv{Backspace}{Delete}{Control>}z{/Control}");
    await autosave();

    expect(kit.latest.tool).toBe(before);
    expect(savedModel(bridge).annotations).toHaveLength(1);
    expect(savedModel(bridge).annotations[0]).toMatchObject({ stroke: { color: "#e02424" } });
  });
});
