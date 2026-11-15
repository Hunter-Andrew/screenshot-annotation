import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng, type AnnotatedImage } from "../core/annotatedImage";
import type { ArrowAnnotation } from "../core/annotation";
import { hasChunk } from "../core/testing";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
const FIRST = new Date(2026, 10, 15, 13, 45, 1);
const SECOND = new Date(2026, 10, 15, 13, 46, 2);

const ARROW: ArrowAnnotation = {
  id: "a1",
  type: "arrow",
  x1: 0,
  y1: 0,
  x2: 2,
  y2: 1,
  stroke: { color: "#e02424", width: 4 },
  arrowheads: { ends: "end" },
};

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});
// Real time keeps flowing (so user-event and waitFor work) but timers can be pushed forward by hand.
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openEditor(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  return kit;
}

async function capture(bridge: FakeBridge, capturedAt = FIRST) {
  const before = bridge.libraryFiles.length;
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt }));
  await waitFor(() => expect(bridge.libraryFiles).toHaveLength(before + 1));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
}

/** The latest Library file's model, decoded as the next app start would read it. */
const savedModel = (bridge: FakeBridge, index = 0) => decodeLibraryPng(bridge.libraryFiles[index]!.bytes).model;
const userDraws = async (kit: StubKit, annotation: ArrowAnnotation = ARROW) => {
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  await act(async () => kit.latest.draw(annotation));
};
const autosave = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));

describe("layout A", () => {
  it("has the top bar buttons, a tool column with names and keys, and a Style panel", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);

    for (const name of ["Discard", "Save as PNG…", "Copy", "Settings"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    const tools = screen.getByRole("navigation", { name: "Tools" });
    expect(tools).toHaveTextContent(/Select\s*V/);
    expect(tools).toHaveTextContent(/Arrow\s*A/);
    expect(screen.getByRole("complementary", { name: "Style" })).toBeVisible();
  });

  it("opens Settings from the gear", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(bridge.settingsOpened).toBe(1);
  });
});

describe("tools and shortcut keys", () => {
  it("picks the Arrow tool with A and Select with V, and tells the canvas", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await waitFor(() => expect(kit.canvases).toHaveLength(1));

    await userEvent.keyboard("a");
    expect(screen.getByRole("button", { name: /^Arrow/ })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(kit.latest.tool).toBe("arrow"));

    await userEvent.keyboard("v");
    expect(screen.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(kit.latest.tool).toBe("select"));
  });

  it("ignores a key for a tool that does not exist yet (B is in the table, but there is no Blur tool)", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userEvent.keyboard("a");

    await userEvent.keyboard("b");

    expect(screen.getByRole("button", { name: /^Arrow/ })).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.tool).toBe("arrow");
  });

  it("Esc deselects the Annotation and returns to Select", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit);
    await userEvent.keyboard("a");
    await waitFor(() => expect(kit.latest.tool).toBe("arrow"));
    await act(async () => kit.latest.click("a1"));

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(kit.latest.selected).toBeNull());
    expect(screen.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.tool).toBe("select");
  });

  it("does not take letters typed into a field (the thickness box) as tool keys", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userEvent.keyboard("a");
    await waitFor(() => expect(kit.latest.tool).toBe("arrow"));

    await userEvent.click(screen.getByRole("spinbutton", { name: "Thickness" }));
    await userEvent.keyboard("v");

    expect(kit.latest.tool).toBe("arrow");
  });

  it("Ctrl+C copies when nothing is selected, and leaves a selected Annotation alone", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit);

    await userEvent.keyboard("{Control>}c{/Control}"); // the new arrow is selected
    expect(bridge.copiedImages).toHaveLength(0);

    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Control>}c{/Control}");
    await waitFor(() => expect(bridge.copiedImages).toHaveLength(1));
  });
});

describe("drawing an Arrow", () => {
  it("adds it to the image, selects it and goes back to Select, and the Library PNG gets it after 1 s", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userEvent.keyboard("a");

    await userDraws(kit);

    expect(kit.latest.model?.annotations).toEqual([ARROW]);
    expect(kit.latest.selected).toBe("a1");
    expect(kit.latest.tool).toBe("select");
    expect(savedModel(bridge).annotations).toEqual([]); // not yet: auto-save is debounced
    await autosave();
    expect(savedModel(bridge).annotations).toEqual([ARROW]);
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
  });

  it("draws in the tool's style: what the Style panel shows before drawing", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);

    await userEvent.keyboard("a");
    await userEvent.click(screen.getByRole("button", { name: "Color #2563eb" }));
    await userEvent.click(screen.getByRole("button", { name: "Both ends" }));

    await waitFor(() =>
      expect(kit.latest.drawStyle).toEqual({
        stroke: { color: "#2563eb", width: 4 },
        arrowheads: { ends: "both" },
      }),
    );
  });

  it("moving or resizing it changes only its geometry and is auto-saved", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit);
    await autosave();

    await act(async () => kit.latest.edit("a1", { x1: 1, y1: 1, x2: 2, y2: 2 }));
    await autosave();

    expect(savedModel(bridge).annotations).toEqual([{ ...ARROW, x1: 1, y1: 1, x2: 2, y2: 2 }]);
  });
});

describe("Style panel", () => {
  it("shows the Stroke and Arrowheads groups for an Arrow, and nothing to style for Select", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    expect(screen.getByText(/Select an Annotation, or pick a tool/)).toBeVisible();

    await userEvent.keyboard("a");

    expect(screen.getByRole("region", { name: "Stroke" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Arrowheads" })).toBeVisible();
    expect(kit.latest.tool).toBe("arrow");
  });

  it("restyles the selected Arrow: color, thickness (preset and typed) and both ends, all auto-saved", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit);

    await userEvent.click(screen.getByRole("button", { name: "Color #16a34a" }));
    await userEvent.click(screen.getByRole("button", { name: "Thickness 8" }));
    await userEvent.click(screen.getByRole("button", { name: "Both ends" }));
    await autosave();

    expect(savedModel(bridge).annotations).toEqual([
      { ...ARROW, stroke: { color: "#16a34a", width: 8 }, arrowheads: { ends: "both" } },
    ]);

    const thickness = screen.getByRole("spinbutton", { name: "Thickness" });
    await userEvent.clear(thickness);
    await userEvent.type(thickness, "12");
    await autosave();
    expect(savedModel(bridge).annotations[0]).toMatchObject({ stroke: { color: "#16a34a", width: 12 } });
  });

  it("ignores a thickness outside 1 to 30 and shows the real value again when leaving the box", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit);
    const thickness = screen.getByRole("spinbutton", { name: "Thickness" });

    await userEvent.clear(thickness);
    await userEvent.type(thickness, "0"); // 0 is below the smallest thickness
    await autosave();

    expect(savedModel(bridge).annotations[0]).toMatchObject({ stroke: { width: 4 } }); // untouched
    await userEvent.tab(); // leaving the box puts the real value back
    expect(thickness).toHaveValue(4);
  });

  it("shows the selected Annotation's own style", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit, { ...ARROW, stroke: { color: "#9333ea", width: 8 }, arrowheads: { ends: "both" } });

    expect(screen.getByRole("button", { name: "Color #9333ea" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Thickness 8" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Both ends" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Export with Annotations", () => {
  it("Copy and Save as PNG… render the Annotations and stay plain PNGs", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    const rendered: AnnotatedImage[] = [];
    kit.render = async (image) => (rendered.push(image), image.capture);
    await capture(bridge);
    await userDraws(kit);

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await userEvent.click(screen.getByRole("button", { name: "Save as PNG…" }));

    await waitFor(() => expect(bridge.savedAs).toHaveLength(1));
    expect(rendered.map((image) => image.model.annotations)).toEqual([[ARROW], [ARROW]]);
    for (const png of [bridge.copiedImages[0]!, bridge.savedAs[0]!.bytes]) {
      expect(hasChunk(png, "snAP")).toBe(false);
    }
  });
});

describe("reopening an image", () => {
  it("opens the last Library image with its Annotations still editable, and keeps saving into the same file", async () => {
    const bridge = createFakeBridge();
    const first = await openEditor(bridge);
    await capture(bridge);
    await userDraws(first);
    await autosave();
    await act(async () => {}); // let the save land
    document.body.innerHTML = ""; // the window is closed (or reloaded)

    const kit = await openEditor(bridge);

    await waitFor(() => expect(kit.canvases).toHaveLength(1));
    await waitFor(() => expect(kit.latest.model?.annotations).toEqual([ARROW]));
    await act(async () => kit.latest.edit("a1", { x2: 2, y2: 2 }));
    await autosave();
    expect(bridge.libraryFiles).toHaveLength(1);
    expect(savedModel(bridge).annotations).toEqual([{ ...ARROW, x2: 2, y2: 2 }]);
  });

  it("opens a file from a newer version read-only: no tools, no writes", async () => {
    const bridge = createFakeBridge();
    const kit = createStubKit();
    // Build a Library file with a newer format version.
    const path = await bridge.saveToLibrary(
      await (async () => {
        const { encodeLibraryPng, createFromCapture } = await import("../core/annotatedImage");
        const { encodeRgbaPng } = await import("../core/png");
        const image = createFromCapture(encodeRgbaPng(1, 1, new Uint8Array([1, 2, 3, 255])));
        return encodeLibraryPng({ ...image, model: { ...image.model, formatVersion: 99 } });
      })(),
      FIRST,
    );

    await openEditor(bridge, kit);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/read-only/));
    expect(screen.getByRole("button", { name: /^Arrow/ })).toBeDisabled();
    await waitFor(() => expect(kit.canvases).toHaveLength(1));
    await waitFor(() => expect(kit.latest.interactive).toBe(false));
    expect(bridge.libraryUpdates).toEqual([]);
    expect(bridge.libraryFiles.map((f) => f.path)).toEqual([path]);
  });
});

describe("auto-save against Discard and the first save", () => {
  it("Discard right after an edit cancels the pending auto-save and the file is not written again", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await userDraws(kit);

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(bridge.libraryFiles).toEqual([]));
    await autosave();
    await autosave();

    expect(bridge.libraryUpdates).toEqual([]);
    expect(bridge.libraryFiles).toEqual([]);
  });

  it("an edit on the second image goes into the second file, not the first", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge, FIRST);
    await capture(bridge, SECOND);
    await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(1));

    await act(async () => kit.latest.draw(ARROW));
    await autosave();

    expect(savedModel(bridge, 0).annotations).toEqual([]);
    expect(savedModel(bridge, 1).annotations).toEqual([ARROW]);
  });

  it("says when an auto-save fails, and saves the edit on the next change", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    bridge.failNextLibraryUpdate("disk is full");

    await userDraws(kit);
    await autosave();
    expect(screen.getByRole("status")).toHaveTextContent(/Could not save to the Library: disk is full/);

    await act(async () => kit.latest.edit("a1", { x2: 2, y2: 2 }));
    await autosave();
    expect(savedModel(bridge).annotations).toEqual([{ ...ARROW, x2: 2, y2: 2 }]);
  });
});
