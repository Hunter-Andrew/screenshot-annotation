import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { decodeLibraryPng } from "../core/annotatedImage";
import type { ArrowAnnotation } from "../core/annotation";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
const FIRST = new Date(2026, 10, 15, 13, 45, 1);
const SECOND = new Date(2026, 10, 15, 13, 46, 2);

const arrow = (id: string, x2 = 2): ArrowAnnotation => ({
  id,
  type: "arrow",
  x1: 0,
  y1: 0,
  x2,
  y2: 1,
  stroke: { color: "#e02424", width: 4 },
  arrowheads: { ends: "end" },
});

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

async function capture(bridge: FakeBridge, capturedAt = FIRST) {
  const before = bridge.libraryFiles.length;
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt }));
  await waitFor(() => expect(bridge.libraryFiles).toHaveLength(before + 1));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
}

const draw = async (kit: StubKit, annotation: ArrowAnnotation) => {
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  await act(async () => kit.latest.draw(annotation));
};
const autosave = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
const ids = (kit: StubKit) => kit.latest.model?.annotations.map((a) => a.id);
const undoButton = () => screen.getByRole("button", { name: "Undo" });
const redoButton = () => screen.getByRole("button", { name: "Redo" });
/** Close the window and open it again: a restart (the fake bridge keeps the Library and history). */
const restart = async (bridge: FakeBridge) => {
  await act(async () => {});
  document.body.innerHTML = "";
  return openEditor(bridge);
};

describe("undo and redo", () => {
  it("have buttons, disabled until there is something to undo or redo", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();

    await draw(kit, arrow("a1"));
    expect(undoButton()).toBeEnabled();
    expect(redoButton()).toBeDisabled();

    await userEvent.click(undoButton());
    expect(ids(kit)).toEqual([]);
    expect(redoButton()).toBeEnabled();
    await userEvent.click(redoButton());
    expect(ids(kit)).toEqual(["a1"]);
  });

  it("Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo, and the canvas is redrawn from the model", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, arrow("a1"));
    await draw(kit, arrow("a2"));
    expect(ids(kit)).toEqual(["a1", "a2"]);

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(ids(kit)).toEqual(["a1"]);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(ids(kit)).toEqual([]);
    await userEvent.keyboard("{Control>}y{/Control}");
    expect(ids(kit)).toEqual(["a1"]);
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(ids(kit)).toEqual(["a1", "a2"]);
  });

  it("an undo is saved like any edit, and drops a selection that no longer exists", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, arrow("a1")); // selected after drawing
    await autosave();
    expect(decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model.annotations).toHaveLength(1);

    await userEvent.click(undoButton());
    await autosave();

    expect(decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model.annotations).toEqual([]);
    expect(kit.latest.selected).toBeNull();
  });

  it("undoes a move or a restyle, one burst at a time", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, arrow("a1"));
    // The edit is more than half a second after the draw: its own step.
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    await act(async () => kit.latest.edit("a1", { x2: 9 }));
    expect(kit.latest.model?.annotations[0]).toMatchObject({ x2: 9 });

    await userEvent.click(undoButton());

    expect(kit.latest.model?.annotations[0]).toMatchObject({ x2: 2 });
  });

  it("survives a restart: the history comes back with the image", async () => {
    const bridge = createFakeBridge();
    const first = await openEditor(bridge);
    await capture(bridge);
    await draw(first, arrow("a1"));
    await draw(first, arrow("a2"));
    await autosave();
    await act(async () => {});
    await waitFor(() => expect(bridge.historyFiles.size).toBe(1));

    const kit = await restart(bridge);

    await waitFor(() => expect(ids(kit)).toEqual(["a1", "a2"]));
    expect(undoButton()).toBeEnabled();
    await userEvent.click(undoButton());
    expect(ids(kit)).toEqual(["a1"]);
    await userEvent.click(undoButton());
    expect(ids(kit)).toEqual([]);
    await userEvent.click(redoButton());
    await userEvent.click(redoButton());
    expect(ids(kit)).toEqual(["a1", "a2"]);
  });

  it("is gone after a restart when the PNG was changed outside the app", async () => {
    const bridge = createFakeBridge();
    const first = await openEditor(bridge);
    await capture(bridge);
    await draw(first, arrow("a1"));
    await autosave();
    await waitFor(() => expect(bridge.historyFiles.size).toBe(1));
    // Another program saves the file.
    const outside = new Uint8Array(bridge.libraryFiles[0]!.bytes);
    outside[outside.length - 20] ^= 0xff; // flips a byte in the IEND-adjacent data; still a PNG to the app
    await bridge.updateLibraryFile(bridge.libraryFiles[0]!.path, outside);

    await restart(bridge);

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled());
    expect(undoButton()).toBeDisabled();
    expect(bridge.historyFiles.size).toBe(0);
  });

  it("each image keeps its own history, which Undo of a Discard brings back", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge, FIRST);
    await draw(kit, arrow("a1"));
    await autosave();
    await capture(bridge, SECOND);
    expect(undoButton()).toBeDisabled(); // the second image has no edits yet

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(bridge.libraryFiles).toHaveLength(1));
    await waitFor(() => expect(undoButton()).toBeEnabled()); // back on the first image, with its history

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(bridge.libraryFiles).toHaveLength(0));
    // Kept while the Undo notice is up, so Undo gives the image back with its history.
    expect(bridge.historyFiles.size).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: "Undo delete" }));
    await waitFor(() => expect(bridge.libraryFiles).toHaveLength(1));
    await waitFor(() => expect(undoButton()).toBeEnabled());
    expect(bridge.historyFiles.size).toBe(1);
  });

  it("leaves Ctrl+Z to a text field: typing in the thickness box never undoes the canvas", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, arrow("a1"));
    const box = screen.getByRole("spinbutton");

    await userEvent.click(box);
    await userEvent.keyboard("{Control>}z{/Control}{Delete}{Backspace}");

    expect(ids(kit)).toEqual(["a1"]);
  });
});

describe("delete", () => {
  it("Delete removes the selected Annotation, Backspace too, and undo brings it back in place", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    for (const id of ["a1", "a2", "a3"]) await draw(kit, arrow(id));
    await act(async () => kit.latest.click("a2"));

    await userEvent.keyboard("{Delete}");
    expect(ids(kit)).toEqual(["a1", "a3"]);
    expect(kit.latest.selected).toBeNull();
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(ids(kit)).toEqual(["a1", "a2", "a3"]);

    await act(async () => kit.latest.click("a3"));
    await userEvent.keyboard("{Backspace}");
    expect(ids(kit)).toEqual(["a1", "a2"]);
  });

  it("the Delete button in the Style panel does the same, and nothing is deleted with nothing selected", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, arrow("a1"));

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(ids(kit)).toEqual([]);
    await draw(kit, arrow("a2"));
    await act(async () => kit.latest.click(null));
    await userEvent.keyboard("{Delete}");
    expect(ids(kit)).toEqual(["a2"]);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("Ctrl+Delete is still Discard, not delete", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    await draw(kit, arrow("a1"));

    await userEvent.keyboard("{Control>}{Delete}{/Control}");

    await waitFor(() => expect(bridge.libraryFiles).toEqual([]));
  });
});

describe("stacking order", () => {
  it("Bring forward and Send back move the selected Annotation one step, by button or Ctrl+] / Ctrl+[", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    for (const id of ["a1", "a2", "a3"]) await draw(kit, arrow(id));
    await act(async () => kit.latest.click("a1"));
    expect(screen.getByRole("button", { name: "Send back" })).toBeDisabled(); // already at the back

    await userEvent.click(screen.getByRole("button", { name: "Bring forward" }));
    expect(ids(kit)).toEqual(["a2", "a1", "a3"]);
    await userEvent.keyboard("{Control>}]{/Control}");
    expect(ids(kit)).toEqual(["a2", "a3", "a1"]);
    expect(screen.getByRole("button", { name: "Bring forward" })).toBeDisabled(); // on top
    await userEvent.keyboard("{Control>}[[{/Control}");
    expect(ids(kit)).toEqual(["a2", "a1", "a3"]);
    await userEvent.click(screen.getByRole("button", { name: "Send back" }));
    expect(ids(kit)).toEqual(["a1", "a2", "a3"]);
  });

  it("a reorder is saved and can be undone", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge);
    for (const id of ["a1", "a2"]) await draw(kit, arrow(id));
    await act(async () => kit.latest.click("a1"));
    await userEvent.click(screen.getByRole("button", { name: "Bring forward" }));
    await autosave();
    expect(decodeLibraryPng(bridge.libraryFiles[0]!.bytes).model.annotations.map((a) => a.id)).toEqual(["a2", "a1"]);

    await userEvent.click(undoButton());

    expect(ids(kit)).toEqual(["a1", "a2"]);
  });
});
