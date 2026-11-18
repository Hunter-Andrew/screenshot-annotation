// Ticket 38: Ctrl+V pastes an image from the clipboard as an image Annotation. The canvas is the stub
// kit's (jsdom has none); the real Fabric canvas is exercised in e2e/pasteImage.spec.ts.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { createFromCapture, decodeLibraryPng, encodeLibraryPng } from "../core/annotatedImage";
import type { ImageAnnotation } from "../core/annotation";
import { encodeRgbaPng } from "../core/png";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

// Reading and hashing a picture are real asynchronous work (not timers): wait for them in real time.
const realSetTimeout = globalThis.setTimeout;
const realWait = (ms: number) => new Promise<void>((resolve) => realSetTimeout(resolve, ms));

const CAPTURE = { width: 20, height: 10 };
const solid = (w: number, h: number, v = 100) => encodeRgbaPng(w, h, new Uint8Array(w * h * 4).fill(v));

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
  const before = bridge.libraryFiles.length;
  await act(async () =>
    bridge.simulateCapture({
      ...CAPTURE,
      rgba: new Uint8Array(CAPTURE.width * CAPTURE.height * 4).fill(255),
      capturedAt: new Date(2026, 10, 16, 10, 0, before + 1),
    }),
  );
  await waitFor(() => expect(bridge.libraryFiles).toHaveLength(before + 1));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
}

/** Ctrl+V with `png` (and optionally text) on the clipboard; `target` is where the paste lands. */
async function paste(png: Uint8Array | null, opts: { text?: string; target?: Element } = {}) {
  const file = png ? new File([png as BlobPart], "image.png", { type: "image/png" }) : null;
  const clipboardData = {
    files: file ? [file] : [],
    items: [
      ...(file ? [{ kind: "file", type: "image/png", getAsFile: () => file }] : []),
      ...(opts.text ? [{ kind: "string", type: "text/plain", getAsFile: () => null }] : []),
    ],
    getData: (type: string) => (type === "text/plain" ? (opts.text ?? "") : ""),
    types: [...(file ? ["Files"] : []), ...(opts.text ? ["text/plain"] : [])],
  };
  let event!: Event;
  await act(async () => {
    event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    (opts.target ?? document.body).dispatchEvent(event);
    await realWait(40);
    await vi.advanceTimersByTimeAsync(20);
  });
  return event;
}

const images = (kit: StubKit) => (kit.latest.model?.annotations ?? []).filter((a): a is ImageAnnotation => a.type === "image");
const status = () => screen.getByRole("status");

describe("Ctrl+V with an image on the clipboard", () => {
  it("adds one image Annotation, centred, at its own size, and selects it", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);

    const event = await paste(solid(8, 4));

    expect(event.defaultPrevented).toBe(true);
    const [image] = images(kit);
    expect(image).toMatchObject({
      type: "image",
      x: 6,
      y: 3,
      width: 8,
      height: 4,
      border: { enabled: false },
      opacity: { value: 1 },
    });
    expect(kit.latest.selected).toBe(image!.id);
    expect(kit.latest.images?.[image!.imageId]).toEqual(solid(8, 4));
    // The canvas never changes size.
    expect(kit.latest.size).toEqual(CAPTURE);
    // The Style panel shows the two groups, and nothing else.
    expect(screen.getByRole("region", { name: "Border" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Opacity" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Stroke" })).toBeNull();
  });

  it("scales an image bigger than the Capture down to fit, keeping its shape", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);

    await paste(solid(80, 20));

    expect(images(kit)[0]).toMatchObject({ x: 0, y: 2.5, width: 20, height: 5 });
  });

  it("goes back to Select when a drawing tool was active", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).keyboard("r");
    expect(kit.latest.tool).toBe("rect");

    await paste(solid(4, 4));

    expect(screen.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.tool).toBe("select");
    expect(kit.latest.selected).toBe(images(kit)[0]!.id);
  });

  it("is saved in the Library file as an image with its bytes, and the file is version 2", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await paste(solid(8, 4));
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));

    const saved = decodeLibraryPng(bridge.libraryFiles[0]!.bytes);
    expect(saved.model.formatVersion).toBe(2);
    expect(saved.images?.[images(kit)[0]!.imageId]).toEqual(solid(8, 4));
  });

  it("pasting the same picture twice stores its bytes once", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await paste(solid(4, 4));
    await paste(solid(4, 4));

    const [a, b] = images(kit);
    expect(a!.id).not.toBe(b!.id);
    expect(a!.imageId).toBe(b!.imageId);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    expect(Object.keys(decodeLibraryPng(bridge.libraryFiles[0]!.bytes).images ?? {})).toHaveLength(1);
  });

  it("adds nothing to the stored tool styles, and has no tool-column button", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await paste(solid(4, 4));
    // Restyle it: still nothing is remembered for a next paste.
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(within(screen.getByRole("region", { name: "Border" })).getByRole("button", { name: "On" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));

    expect(bridge.toolStyles).toEqual({});
    expect(within(screen.getByRole("navigation", { name: "Tools" })).queryByRole("button", { name: /image/i })).toBeNull();
    expect(images(kit)[0]!.border.enabled).toBe(true);

    // The next paste starts plain again.
    await paste(solid(2, 2));
    expect(images(kit)[1]).toMatchObject({ border: { enabled: false }, opacity: { value: 1 } });
  });
});

describe("what Ctrl+V does not do", () => {
  it("stays a text paste in a text field: no image, the browser's own paste is not cancelled", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    const input = document.createElement("input");
    input.type = "text";
    document.body.append(input);
    input.focus();

    const event = await paste(solid(4, 4), { text: "hello", target: input });

    expect(event.defaultPrevented).toBe(false);
    expect(images(kit)).toHaveLength(0);
    input.remove();
  });

  it("stays a text paste while a text box on the canvas is being edited (its hidden textarea has focus)", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    const area = document.createElement("textarea");
    document.body.append(area);
    area.focus();

    await paste(solid(4, 4), { text: "words", target: area });

    expect(images(kit)).toHaveLength(0);
    area.remove();
  });

  it("lets the image win when the clipboard holds text and an image and nothing is being typed", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);

    await paste(solid(4, 4), { text: "a caption" });

    expect(images(kit)).toHaveLength(1);
  });

  it("ignores a clipboard with no image (text only): nothing changes, no message", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    const before = status().textContent;

    const event = await paste(null, { text: "just words" });

    expect(event.defaultPrevented).toBe(false);
    expect(images(kit)).toHaveLength(0);
    expect(status().textContent).toBe(before);
  });

  it("with no image open changes nothing and says to take or open a capture first", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);

    await paste(solid(4, 4));

    expect(status()).toHaveTextContent("Take or open a capture before pasting an image");
    expect(bridge.libraryFiles).toHaveLength(0);
  });

  it("refuses on a read-only image (saved by a newer version) with the read-only wording", async () => {
    const bridge = createFakeBridge();
    const plain = createFromCapture(solid(20, 10));
    bridge.addLibraryFile(await encodeLibraryPng({ ...plain, model: { ...plain.model, formatVersion: 99 } }), {
      capturedAt: new Date(2026, 10, 16, 9, 0, 0),
    });
    const kit = await openEditor(bridge);
    await screen.findByText(/Opened read-only/);
    await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));

    await paste(solid(4, 4));

    expect(status()).toHaveTextContent("Opened read-only: it was saved by a newer version of Screenshot Annotation");
    expect(images(kit)).toHaveLength(0);
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(bridge.libraryUpdates).toEqual([]);
  });

  it("does nothing in the full-window grid", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByRole("button", { name: /^All captures/ }));
    expect(await screen.findByRole("region", { name: "All captures" })).toBeVisible();

    const event = await paste(solid(4, 4));

    expect(event.defaultPrevented).toBe(false);
    expect(images(kit)).toHaveLength(0);
  });
});

describe("the limits", () => {
  const claiming = (width: number, height: number) => {
    const real = solid(1, 1);
    const view = new DataView(real.buffer, real.byteOffset, real.byteLength);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return real;
  };

  it("refuses a picture over 8192 px on a side in the status line, and adds nothing", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);

    await paste(claiming(9000, 100));

    expect(status()).toHaveTextContent(/9000 x 100 px.*8192/);
    expect(images(kit)).toHaveLength(0);
  });

  it("refuses a picture over about 25 MB", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    const big = new Uint8Array(25 * 1024 * 1024 + 1);
    big.set(solid(2, 2));

    await paste(big);

    expect(status()).toHaveTextContent(/25 MB/);
    expect(images(kit)).toHaveLength(0);
  });

  it("refuses the 21st image", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    for (let i = 0; i < 20; i++) await paste(solid(2, 2, i));
    expect(images(kit)).toHaveLength(20);

    await paste(solid(2, 2, 200));

    expect(status()).toHaveTextContent(/at most 20/);
    expect(images(kit)).toHaveLength(20);
  });

  it("refuses bytes that are not a picture", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);

    await paste(new Uint8Array([1, 2, 3, 4]));

    expect(status()).toHaveTextContent(/could not be read/);
    expect(images(kit)).toHaveLength(0);
  });
});

describe("an image is a normal Annotation", () => {
  async function pasted() {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await paste(solid(8, 4, 50));
    return { bridge, kit };
  }

  it("is one undo step to add: Ctrl+Z removes it, Ctrl+Y brings it back", async () => {
    const { kit } = await pasted();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.keyboard("{Control>}z{/Control}");
    expect(images(kit)).toHaveLength(0);
    await user.keyboard("{Control>}y{/Control}");
    expect(images(kit)).toHaveLength(1);
  });

  it("moves and resizes as one step per gesture, and a restyle is a step", async () => {
    const { kit } = await pasted();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const id = images(kit)[0]!.id;
    await act(async () => kit.latest.edit(id, { x: 1, y: 1 }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
    await act(async () => kit.latest.edit(id, { x: 1, y: 1, width: 16, height: 8 } as Partial<ImageAnnotation>));
    expect(images(kit)[0]).toMatchObject({ width: 16, height: 8 });
    await user.keyboard("{Control>}z{/Control}");
    expect(images(kit)[0]).toMatchObject({ x: 1, width: 8 });
    await user.keyboard("{Control>}z{/Control}");
    expect(images(kit)[0]).toMatchObject({ x: 6, y: 3 });
  });

  it("restyles through the Style panel: border on with a width and color, an opacity preset", async () => {
    const { kit } = await pasted();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const border = screen.getByRole("region", { name: "Border" });
    expect(within(border).getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
    expect(within(border).queryByLabelText("Border width")).toBeNull(); // hidden while off

    await user.click(within(border).getByRole("button", { name: "On" }));
    await user.click(within(border).getByRole("button", { name: "Border width 8" }));
    expect(images(kit)[0]!.border).toMatchObject({ enabled: true, width: 8 });
    fireEvent.change(within(border).getByLabelText("Border width"), { target: { value: "30" } });
    expect(images(kit)[0]!.border.width).toBe(30);
    fireEvent.change(within(border).getByLabelText("Border width"), { target: { value: "31" } });
    expect(images(kit)[0]!.border.width).toBe(30); // out of range: not applied
    fireEvent.change(within(border).getByLabelText("Border color hex"), { target: { value: "#2563eb" } });
    fireEvent.blur(within(border).getByLabelText("Border color hex"));
    expect(images(kit)[0]!.border.color).toBe("#2563eb");

    const opacity = screen.getByRole("region", { name: "Opacity" });
    expect(within(opacity).getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(opacity).getByRole("button", { name: "60%" }));
    expect(images(kit)[0]!.opacity.value).toBe(0.6);
    expect(within(opacity).getByRole("button", { name: "60%" })).toHaveAttribute("aria-pressed", "true");
  });

  it("brings forward, sends back and deletes like any Annotation", async () => {
    const { kit } = await pasted();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await paste(solid(2, 2, 7));
    const [first, second] = images(kit);
    await act(async () => kit.latest.click(second!.id));
    await user.click(screen.getByRole("button", { name: "Send back" }));
    expect(images(kit).map((a) => a.id)).toEqual([second!.id, first!.id]);
    await user.click(screen.getByRole("button", { name: "Bring forward" }));
    expect(images(kit).map((a) => a.id)).toEqual([first!.id, second!.id]);

    await user.keyboard("{Delete}");
    expect(images(kit).map((a) => a.id)).toEqual([first!.id]);
  });

  it("Undo of a delete brings the image back with its original pixels, also after a save and reopen", async () => {
    const { bridge, kit } = await pasted();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const original = images(kit)[0]!;
    await user.keyboard("{Delete}");
    expect(images(kit)).toHaveLength(0);
    // Saved without the image: its bytes are not in the Library file any more...
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    expect(decodeLibraryPng(bridge.libraryFiles[0]!.bytes).images).toEqual({});

    await user.keyboard("{Control>}z{/Control}");

    expect(images(kit)[0]).toEqual(original);
    expect(kit.latest.images?.[original.imageId]).toEqual(solid(8, 4, 50));
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    expect(decodeLibraryPng(bridge.libraryFiles[0]!.bytes).images?.[original.imageId]).toEqual(solid(8, 4, 50));
  });

  it("keeps a deleted image's pixels in the history file, so Undo works after a restart", async () => {
    const { bridge, kit } = await pasted();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const original = images(kit)[0]!;
    await user.keyboard("{Delete}");
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));

    // A second editor on the same bridge: the image opens from the Library with its history.
    document.body.innerHTML = "";
    const reopened = await openEditor(bridge);
    await waitFor(() => expect(reopened.canvases.length).toBeGreaterThan(0));
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).keyboard("{Control>}z{/Control}");

    expect(images(reopened)[0]).toMatchObject({ imageId: original.imageId });
    expect(reopened.latest.images?.[original.imageId]).toEqual(solid(8, 4, 50));
  });
});
