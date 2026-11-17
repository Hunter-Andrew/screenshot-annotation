import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import type { CalloutAnnotation, TextAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

// Per-selection styling in the editor, with a stub canvas that plays the part of the user selecting characters
// while typing. The real canvas is exercised in e2e/richTextEditing.spec.ts.

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

const TEXT: TextAnnotation = {
  id: "t1",
  type: "text",
  x: 0,
  y: 0,
  width: 100,
  text: "Hello world",
  font: { size: 24, bold: false, italic: false, color: "#e02424", align: "left", valign: "top", underline: false },
  textOutline: { enabled: true, color: "#ffffff", width: 2 },
};
const STYLED: TextAnnotation = {
  ...TEXT,
  runs: [
    { from: 0, to: 5, font: { bold: true } },
    { from: 6, to: 11, font: { color: "#2563eb", size: 40 } },
  ],
};
const mixedLook = { size: 24, bold: "mixed", italic: false, underline: false, color: "#e02424" } as const;

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

const savedBoxes = (bridge: FakeBridge) => decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model.annotations as (TextAnnotation | CalloutAnnotation)[];
const autosave = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));

async function selectBox(kit: StubKit, annotation: TextAnnotation = STYLED) {
  await act(async () => kit.latest.draw(annotation));
  await act(async () => kit.latest.click(annotation.id));
}

describe("the Font controls with characters selected in a box being typed in", () => {
  it("style the selection through the canvas, and change neither the box nor the saved Annotation", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await selectBox(kit, TEXT);
    await act(async () => kit.latest.selectText({ font: { ...mixedLook, bold: false } }));

    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Font" }), "Color #16a34a"));
    await autosave();

    expect(kit.latest.textStyled).toEqual([{ bold: true }, { color: "#16a34a" }]);
    expect(savedBoxes(bridge)[0]).toEqual(TEXT); // nothing of the box's own changed
  });

  it("show the selection's values, with mixed shown as mixed, and the box's own values again once the selection is gone", async () => {
    const kit = await openWithCapture(createFakeBridge());
    await selectBox(kit, TEXT);
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");

    await act(async () => kit.latest.selectText({ font: { ...mixedLook, size: 40, italic: true } }));
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "mixed");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("spinbutton", { name: "Font size" })).toHaveValue(40);

    await act(async () => kit.latest.selectText(null));
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("spinbutton", { name: "Font size" })).toHaveValue(24);
  });

  it("do not change what a new Text starts with (the tool's remembered style)", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await selectBox(kit, TEXT);
    await act(async () => kit.latest.selectText({ font: { ...mixedLook, bold: false } }));
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));

    await act(async () => kit.latest.selectText(null));
    await userEvent.keyboard("t");

    expect(kit.latest.drawStyle.font).toMatchObject({ bold: false });
  });

  it("hand the keyboard back to the text after a button", async () => {
    const kit = await openWithCapture(createFakeBridge());
    await selectBox(kit, TEXT);
    await act(async () => kit.latest.selectText({ font: { ...mixedLook, bold: false } }));
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(kit.latest.textFocused).toBe(1);
  });

  it("a styled box the canvas reports after the edit is saved with its runs, and one with none saves none", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await selectBox(kit, TEXT);

    await act(async () => kit.latest.edit("t1", { text: "Hello world", runs: [{ from: 0, to: 5, font: { bold: true } }] }));
    await autosave();
    expect(savedBoxes(bridge)[0]!.runs).toEqual([{ from: 0, to: 5, font: { bold: true } }]);

    await act(async () => kit.latest.edit("t1", { runs: [] }));
    await autosave();
    expect("runs" in savedBoxes(bridge)[0]!).toBe(false);
  });
});

describe("the Font controls with a caret only, or on a selected box that is not being typed in, change the whole box", () => {
  it("making everything bold takes bold off the characters that had it, and keeps their other styles", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await selectBox(kit);

    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    await autosave();

    expect(kit.latest.textStyled).toEqual([]);
    const [box] = savedBoxes(bridge);
    expect(box!.font.bold).toBe(true);
    expect(box!.runs).toEqual([{ from: 6, to: 11, font: { color: "#2563eb", size: 40 } }]);
  });

  it("a new size or color for the whole box takes those off every character, and nothing else", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await selectBox(kit);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Font size presets" }), "48");
    await userEvent.click(within(screen.getByRole("region", { name: "Font" }), "Color #16a34a"));
    await autosave();

    const [box] = savedBoxes(bridge);
    expect(box!.font).toMatchObject({ size: 48, color: "#16a34a" });
    expect(box!.runs).toEqual([{ from: 0, to: 5, font: { bold: true } }]);
  });

  it("the alignments and the outline leave the runs alone", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await selectBox(kit);

    await userEvent.click(screen.getByRole("button", { name: "Align center" }));
    await userEvent.click(screen.getByRole("button", { name: "Align bottom" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Outline" }));
    await autosave();

    expect(savedBoxes(bridge)[0]!.runs).toEqual(STYLED.runs);
  });

  it("a box with no styled characters gets no `runs` key from a whole-box change", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await selectBox(kit, TEXT);

    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    await autosave();

    expect("runs" in savedBoxes(bridge)[0]!).toBe(false);
  });

  it("the whole-box change and the runs it reset are one undo step", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await selectBox(kit);
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));

    await userEvent.keyboard("{Control>}z{/Control}");
    await autosave();

    const [box] = savedBoxes(bridge);
    expect(box!.font.bold).toBe(false);
    expect(box!.runs).toEqual(STYLED.runs);
  });

  it("works the same for a Callout", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    const callout: CalloutAnnotation = {
      ...STYLED,
      type: "callout",
      stroke: { color: "#e02424", width: 3 },
      fill: { mode: "none", color: "#ffffff", opacity: 1 },
      tail: { enabled: true },
    };
    await act(async () => kit.latest.draw(callout));
    await act(async () => kit.latest.click("t1"));

    await act(async () => kit.latest.selectText({ font: { ...mixedLook, bold: false } }));
    await userEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(kit.latest.textStyled).toEqual([{ italic: true }]);

    await act(async () => kit.latest.selectText(null));
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    await autosave();
    const [box] = savedBoxes(bridge);
    expect(box!.type).toBe("callout");
    expect(box!.font.bold).toBe(true);
    expect(box!.runs).toEqual([{ from: 6, to: 11, font: { color: "#2563eb", size: 40 } }]);
  });
});

/** A button inside a region, by its accessible name. */
function within(region: HTMLElement, name: string): HTMLElement {
  const found = Array.from(region.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === name);
  if (!found) throw new Error(`no ${name}`);
  return found as HTMLElement;
}
