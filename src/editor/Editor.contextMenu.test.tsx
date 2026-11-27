// The editor's right-click menu (Paste, Copy, Copy original image), Ctrl+Z on a box that was just placed, and the
// Text box minimum width reaching the canvas. The canvas is the stub kit's; the real one is in e2e/.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import { encodeRgbaPng } from "../core/png";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openWithCapture(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  return kit;
}

const rightClickCanvas = () => fireEvent.contextMenu(document.querySelector(".well")!, { clientX: 40, clientY: 50 });
const savedModel = (bridge: FakeBridge) => decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model;

describe("the canvas's right-click menu", () => {
  it("offers Paste, Copy and Copy original image, and closes on Escape", async () => {
    await openWithCapture(createFakeBridge());
    rightClickCanvas();
    expect(screen.getByRole("menu", { name: "Canvas" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /^Paste/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /^Copy$|^Copy\s*Ctrl/ })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /Copy original image/ })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens nothing before there is an image", async () => {
    render(<Editor bridge={createFakeBridge()} kit={createStubKit()} />);
    await act(async () => {});
    rightClickCanvas();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Copy puts the annotated image on the clipboard, like the Copy button", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    kit.latest.draw({ id: "r1", type: "rect", x: 0, y: 0, width: 1, height: 1, stroke: { color: "#ff0000", width: 2 }, fill: { mode: "none", color: "#ffffff", opacity: 1 } } as never);
    await act(async () => {});
    rightClickCanvas();
    await userEvent.click(screen.getByRole("menuitem", { name: /^Copy(?! original)/ }));
    await waitFor(() => expect(bridge.copiedImages).toHaveLength(1));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Copy original image puts the Capture's own pixels on the clipboard, with none of the annotations", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    kit.latest.draw({ id: "r1", type: "rect", x: 0, y: 0, width: 1, height: 1, stroke: { color: "#ff0000", width: 2 }, fill: { mode: "none", color: "#ffffff", opacity: 1 } } as never);
    await act(async () => {});
    rightClickCanvas();
    await userEvent.click(screen.getByRole("menuitem", { name: /Copy original image/ }));
    await waitFor(() => expect(bridge.copiedImages).toHaveLength(1));
    const original = decodeLibraryPng(bridge.libraryFiles[0]!.bytes).capture;
    expect(Array.from(bridge.copiedImages[0]!)).toEqual(Array.from(original));
  });

  it("Paste puts the clipboard's picture on the image, like Ctrl+V", async () => {
    const bridge = createFakeBridge();
    await openWithCapture(bridge);
    const png = encodeRgbaPng(1, 1, new Uint8Array([10, 20, 30, 255]));
    const read = vi.fn().mockResolvedValue([{ types: ["image/png"], getType: async () => new Blob([png as BlobPart], { type: "image/png" }) }]);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { read } });
    rightClickCanvas();
    await userEvent.click(screen.getByRole("menuitem", { name: /^Paste/ }));
    await waitFor(() => expect(read).toHaveBeenCalled());
    await vi.waitFor(
      async () => {
        await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
        expect(savedModel(bridge).annotations.map((a) => a.type)).toEqual(["image"]);
      },
      { timeout: 4000, interval: 50 },
    );
  });

  it("Paste says so when the clipboard has no picture", async () => {
    await openWithCapture(createFakeBridge());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { read: async () => [{ types: ["text/plain"], getType: async () => new Blob(["x"]) }] } });
    rightClickCanvas();
    await userEvent.click(screen.getByRole("menuitem", { name: /^Paste/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("The clipboard has no picture to paste"));
  });
});

describe("Ctrl+Z on a box that was just placed", () => {
  it("takes the placing back while the box is being typed in, without touching the history", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    kit.latest.typing = true;
    const input = document.body.appendChild(document.createElement("textarea"));
    input.focus();
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(kit.latest.typingCancelled).toBe(1);
    expect(kit.latest.typing).toBe(false);
    expect(savedModel(bridge).annotations).toEqual([]);
    input.remove();
  });

  it("does nothing special when no new box is being typed in", async () => {
    const kit = await openWithCapture(createFakeBridge());
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(kit.latest.typingCancelled).toBe(0);
  });
});

describe("the Text box minimum width setting", () => {
  it("is told to the canvas, starting at 240 and following the setting", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    expect(kit.latest.layout.textBoxMinWidth).toBe(240);
    await act(async () => bridge.setTextBoxMinWidth(0));
    expect(kit.latest.layout.textBoxMinWidth).toBe(0);
    await act(async () => bridge.setTextBoxMinWidth(500));
    expect(kit.latest.layout.textBoxMinWidth).toBe(500);
  });
});
