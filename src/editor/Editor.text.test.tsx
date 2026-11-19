import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import type { TextAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

const TEXT: TextAnnotation = {
  id: "t1",
  type: "text",
  x: 0,
  y: 0,
  width: 100,
  text: "Hello",
  font: { size: 24, bold: false, italic: false, color: "#e02424" },
  textOutline: { enabled: true, color: "#ffffff", width: 2 },
};

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openWithCapture(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  return kit;
}

const savedModel = (bridge: FakeBridge) => decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model;
const autosave = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));

describe("the Text tool in the editor", () => {
  it("T picks the Text tool, which shows the Font and Text outline groups with the red-and-white defaults", async () => {
    const kit = await openWithCapture(createFakeBridge());

    await userEvent.keyboard("t");

    expect(screen.getByRole("button", { name: /^Text/ })).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.tool).toBe("text");
    expect(screen.getByRole("region", { name: "Font" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Text outline" })).toBeVisible();
    expect(kit.latest.drawStyle).toMatchObject({
      font: { size: 32, align: "center", valign: "middle", color: "#e02424" },
      textOutline: { enabled: true, color: "#ffffff", width: 2 },
    });
  });

  it("a text the canvas reports is saved, selected, and the tool goes back to Select", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await userEvent.keyboard("t");

    await act(async () => kit.latest.draw(TEXT));
    await autosave();

    expect(screen.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.selected).toBe("t1");
    expect(savedModel(bridge).annotations).toEqual([TEXT]);
  });

  it("changing the size, bold, italic and outline of the selected text edits that Annotation", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await act(async () => kit.latest.draw(TEXT));
    await act(async () => kit.latest.click("t1"));

    const size = screen.getByRole("spinbutton", { name: "Font size" });
    await userEvent.clear(size);
    await userEvent.type(size, "48");
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    await userEvent.click(screen.getByRole("button", { name: "Italic" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Outline" }));
    await autosave();

    expect(savedModel(bridge).annotations[0]).toMatchObject({
      font: { size: 48, bold: true, italic: true, color: "#e02424" },
      textOutline: { enabled: false },
    });
  });

  it("typing letters into the size box does not switch tools (bare keys are suspended while typing)", async () => {
    const kit = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("t");

    await userEvent.type(screen.getByRole("spinbutton", { name: "Font size" }), "av");

    expect(kit.latest.tool).toBe("text");
  });

  it("a Ctrl view key still works while typing in a field", async () => {
    await openWithCapture(createFakeBridge());
    await userEvent.keyboard("t");
    await userEvent.click(screen.getByRole("spinbutton", { name: "Font size" }));
    expect(screen.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.keyboard("{Control>}={/Control}"); // zoom in leaves Fit mode

    expect(screen.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("vertical alignment and underline in the editor", () => {
  it("a new Text starts Middle and not underlined", async () => {
    const kit = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("t");
    expect(kit.latest.drawStyle.font).toMatchObject({ valign: "middle", underline: false });
    expect(screen.getByRole("button", { name: "Align middle" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a tool style stored before vertical alignment existed starts new boxes Middle too, keeping what it had", async () => {
    const bridge = createFakeBridge();
    await bridge.setToolStyles({ text: { font: { size: 40, bold: true, italic: false, color: "#2563eb" } } });
    const kit = await openWithCapture(bridge);
    await userEvent.keyboard("t");
    await waitFor(() => expect(kit.latest.drawStyle.font).toMatchObject({ size: 40, bold: true, valign: "middle" }));
    expect(screen.getByRole("button", { name: "Align middle" })).toHaveAttribute("aria-pressed", "true");
  });

  it("an older saved Text without a vertical alignment shows Top, and Bottom can be chosen for it", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await act(async () => kit.latest.draw(TEXT));
    await waitFor(() => expect(screen.getByRole("button", { name: "Align top" })).toHaveAttribute("aria-pressed", "true"));

    await userEvent.click(screen.getByRole("button", { name: "Align bottom" }));
    await autosave();

    expect((savedModel(bridge).annotations[0] as TextAnnotation).font.valign).toBe("bottom");
  });

  it("the U button underlines the selected Text and is saved", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await act(async () => kit.latest.draw(TEXT));
    const underline = await screen.findByRole("button", { name: "Underline" });
    expect(underline).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(underline);
    await autosave();

    expect(screen.getByRole("button", { name: "Underline" })).toHaveAttribute("aria-pressed", "true");
    expect((savedModel(bridge).annotations[0] as TextAnnotation).font.underline).toBe(true);
  });
});
