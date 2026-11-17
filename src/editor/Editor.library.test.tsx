import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { createFromCapture, decodeLibraryPng, encodeLibraryPng } from "../core/annotatedImage";
import type { ArrowAnnotation } from "../core/annotation";
import { encodeRgbaPng } from "../core/png";
import { decodePixels, hasChunk } from "../core/testing";
import { UNDO_NOTICE_MS } from "../library/useDeleteWithUndo";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

// Tickets 14 to 17: the Library Strip, deleting with Undo, the grid, and the folder as the source of truth.
// The real Library is a folder; here it is the fake bridge's. The canvas is the stub kit's (jsdom has none).

const A = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
const B = [9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255];
const C = [50, 60, 70, 255, 50, 60, 70, 255, 50, 60, 70, 255, 50, 60, 70, 255];
const T1 = new Date(2026, 10, 15, 13, 45, 1);
const T2 = new Date(2026, 10, 15, 13, 46, 2);
const T3 = new Date(2026, 10, 15, 13, 47, 3);

const arrow = (id: string): ArrowAnnotation => ({
  id,
  type: "arrow",
  x1: 0,
  y1: 0,
  x2: 2,
  y2: 1,
  stroke: { color: "#e02424", width: 4 },
  arrowheads: { ends: "end" },
});

beforeAll(() => {
  URL.createObjectURL = () => "blob:thumb";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function openEditor(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  return kit;
}

async function capture(bridge: FakeBridge, rgba: number[], capturedAt: Date) {
  const before = bridge.libraryFiles.length;
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba, capturedAt }));
  await waitFor(() => expect(bridge.libraryFiles).toHaveLength(before + 1));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
}

const draw = async (kit: StubKit, annotation: ArrowAnnotation) => {
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  await act(async () => kit.latest.draw(annotation));
};
const autosave = () => act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(50)));
const strip = () => screen.getByRole("region", { name: "Library Strip" });
const grid = () => screen.getByRole("region", { name: "All captures" });
const stripPaths = () => within(strip()).getAllByRole("button", { name: /^Open image/ }).map((b) => b.getAttribute("aria-label"));
const open = (at: string, scope: HTMLElement = strip()) => within(scope).getByRole("button", { name: `Open image from ${at}` });
const WHEN1 = "15 Nov 2026 13:45:01";
const WHEN2 = "15 Nov 2026 13:46:02";
const WHEN3 = "15 Nov 2026 13:47:03";
const undoNotice = () => screen.queryByRole("group", { name: "Deleted" });
/** The pixels Copy would put on the clipboard for the image on show. */
async function shownPixels(bridge: FakeBridge) {
  await userEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() => expect(bridge.copiedImages.length).toBeGreaterThan(0));
  return decodePixels(bridge.copiedImages.at(-1)!).rgba;
}
/** A click with Ctrl or Shift held (user-event's one-shot click does not carry held keys between calls). */
const clickWith = (el: HTMLElement, mods: { ctrlKey?: boolean; shiftKey?: boolean }) => fireEvent.click(el, mods);
const plainPng = (rgba: number[]) => encodeRgbaPng(2, 2, Uint8Array.from(rgba));

describe("Library Strip (ticket 14)", () => {
  it("lists every capture, newest on the left, then All captures (N)", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await capture(bridge, C, T3);

    await waitFor(() => expect(stripPaths()).toHaveLength(3));
    expect(stripPaths()).toEqual([`Open image from ${WHEN3}`, `Open image from ${WHEN2}`, `Open image from ${WHEN1}`]);
    expect(within(strip()).getByRole("button", { name: "All captures (3)" })).toBeEnabled();
    expect(open(WHEN3)).toHaveAttribute("aria-current", "true");
    // The pictures come from the platform's thumbnail cache, one request per file.
    await waitFor(() => expect(new Set(bridge.thumbnailRequests).size).toBeGreaterThanOrEqual(3));
  });

  it("says so when the Library is empty", async () => {
    await openEditor(createFakeBridge());
    expect(await within(strip()).findByText("No captures yet")).toBeVisible();
    expect(within(strip()).getByRole("button", { name: "All captures (0)" })).toBeVisible();
  });

  it("a click saves the open image and opens the clicked one, with its Annotations still editable and its history", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await draw(kit, arrow("on-b")); // an edit still waiting for its auto-save

    await userEvent.click(open(WHEN1));

    // Saved before switching: the file already carries the arrow.
    const saved = bridge.libraryFiles.find((f) => f.path.includes("134602"))!;
    expect(decodeLibraryPng(saved.bytes).model.annotations.map((a) => a.id)).toEqual(["on-b"]);
    await waitFor(() => expect(open(WHEN1)).toHaveAttribute("aria-current", "true"));
    expect(await shownPixels(bridge)).toEqual(A);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled(); // the first image has no edits

    await userEvent.click(open(WHEN2));
    await waitFor(() => expect(open(WHEN2)).toHaveAttribute("aria-current", "true"));
    await waitFor(() => expect(kit.latest.model?.annotations.map((a) => a.id)).toEqual(["on-b"]));
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled(); // history came back with it
    // Editable: restyle the arrow through the canvas and it is saved.
    await act(async () => kit.latest.click("on-b"));
    await act(async () => kit.latest.edit("on-b", { x2: 40 } as Partial<ArrowAnnotation>));
    await autosave();
    await waitFor(() => expect((decodeLibraryPng(bridge.libraryFiles.find((f) => f.path.includes("134602"))!.bytes).model.annotations[0] as ArrowAnnotation).x2).toBe(40));
  });

  it("a new capture appears at the left and the earlier ones stay", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    expect(stripPaths()[0]).toBe(`Open image from ${WHEN2}`);
    expect(stripPaths()).toHaveLength(2);
  });

  it("starting the app shows the newest capture, not the one written last", async () => {
    const bridge = createFakeBridge();
    // Two files; the OLDER capture was written to last (edited), as happens after working on an old image.
    const newer = bridge.addLibraryFile(await encodeLibraryPng(createFromCapture(plainPng(B))), { capturedAt: T2 });
    bridge.addLibraryFile(await encodeLibraryPng(createFromCapture(plainPng(A))), { capturedAt: T1 });

    await openEditor(bridge);

    await waitFor(() => expect(open(WHEN2)).toHaveAttribute("aria-current", "true"));
    expect(newer).toContain("134602");
    expect(await shownPixels(bridge)).toEqual(B);
  });

  it("editing an older image does not move it in the strip", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await userEvent.click(open(WHEN1));
    await waitFor(() => expect(open(WHEN1)).toHaveAttribute("aria-current", "true"));
    await draw(kit, arrow("x"));
    await autosave();
    await waitFor(() => expect(bridge.libraryUpdates.some((u) => u.path.includes("134501"))).toBe(true));
    await settle();

    expect(stripPaths()).toEqual([`Open image from ${WHEN2}`, `Open image from ${WHEN1}`]);
  });
});

describe("hover Copy (ticket 15)", () => {
  it("copies that image as a plain Export without opening it", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);

    await userEvent.click(within(strip()).getByRole("button", { name: `Copy image from ${WHEN1}` }));

    await waitFor(() => expect(bridge.copiedImages).toHaveLength(1));
    expect(hasChunk(bridge.copiedImages[0]!, "snAP")).toBe(false);
    expect(decodePixels(bridge.copiedImages[0]!).rgba).toEqual(A);
    expect(open(WHEN2)).toHaveAttribute("aria-current", "true"); // still on the second image
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });
});

describe("deleting from the strip (ticket 15)", () => {
  it("✕ moves that file to the Recycle Bin with no confirmation, offers Undo, and Undo puts it back", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    const firstPath = bridge.libraryFiles[0]!.path;

    await userEvent.click(within(strip()).getByRole("button", { name: `Delete image from ${WHEN1}` }));

    await waitFor(() => expect(bridge.trashedPaths).toEqual([firstPath]));
    expect(bridge.libraryFiles.map((f) => f.path)).not.toContain(firstPath);
    expect(undoNotice()).toHaveTextContent("1 image moved to the Recycle Bin");
    await waitFor(() => expect(stripPaths()).toEqual([`Open image from ${WHEN2}`]));
    expect(open(WHEN2)).toHaveAttribute("aria-current", "true"); // the image on show was not touched

    await userEvent.click(screen.getByRole("button", { name: "Undo delete" }));

    await waitFor(() => expect(bridge.restoredPaths).toEqual([firstPath]));
    expect(undoNotice()).toBeNull();
    await waitFor(() => expect(stripPaths()).toEqual([`Open image from ${WHEN2}`, `Open image from ${WHEN1}`]));
  });

  it("Ctrl+click and Shift+click pick several, and Delete moves them all", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await capture(bridge, C, T3);

    clickWith(open(WHEN3), { ctrlKey: true });
    clickWith(open(WHEN1), { shiftKey: true });
    expect(open(WHEN3)).toHaveAttribute("aria-pressed", "true");
    expect(open(WHEN2)).toHaveAttribute("aria-pressed", "true");
    expect(open(WHEN1)).toHaveAttribute("aria-pressed", "true");
    expect(bridge.trashedPaths).toEqual([]); // nothing is deleted by selecting

    await userEvent.keyboard("{Delete}");

    await waitFor(() => expect(bridge.libraryFiles).toHaveLength(0));
    expect(undoNotice()).toHaveTextContent("3 images moved to the Recycle Bin");
    expect(await screen.findByText("Press Ctrl+Shift+S to capture")).toBeVisible(); // the open image went too

    await userEvent.click(screen.getByRole("button", { name: "Undo delete" }));
    await waitFor(() => expect(bridge.libraryFiles).toHaveLength(3));
    // The image that was open comes back on show.
    await waitFor(() => expect(open(WHEN3)).toHaveAttribute("aria-current", "true"));
  });

  it("with a selected Annotation, Delete still deletes the Annotation and never the picked thumbnails", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await draw(kit, arrow("a1"));
    clickWith(open(WHEN1), { ctrlKey: true });
    expect(open(WHEN1)).toHaveAttribute("aria-pressed", "true");
    await act(async () => kit.latest.click("a1")); // working on the Annotation clears the picked thumbnails
    expect(open(WHEN1)).toHaveAttribute("aria-pressed", "false");

    await userEvent.keyboard("{Delete}");

    expect(kit.latest.model?.annotations).toEqual([]);
    expect(bridge.trashedPaths).toEqual([]);
  });

  it("deleting the open image shows the next older one, else the next newer", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await capture(bridge, C, T3);
    await userEvent.click(open(WHEN2));
    await waitFor(() => expect(open(WHEN2)).toHaveAttribute("aria-current", "true"));

    await userEvent.click(within(strip()).getByRole("button", { name: `Delete image from ${WHEN2}` }));
    await waitFor(() => expect(open(WHEN1)).toHaveAttribute("aria-current", "true")); // older
    expect(await shownPixels(bridge)).toEqual(A);

    await userEvent.click(within(strip()).getByRole("button", { name: `Delete image from ${WHEN1}` }));
    await waitFor(() => expect(open(WHEN3)).toHaveAttribute("aria-current", "true")); // nothing older: the newer
  });

  it("keeps an image's undo history until the notice is over, then deletes it", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge, A, T1);
    await draw(kit, arrow("a1"));
    await autosave();
    await waitFor(() => expect(bridge.historyFiles.size).toBe(1));
    await capture(bridge, B, T2);

    await userEvent.click(within(strip()).getByRole("button", { name: `Delete image from ${WHEN1}` }));
    await waitFor(() => expect(bridge.trashedPaths).toHaveLength(1));
    expect(bridge.historyFiles.size).toBe(1); // still there: Undo would bring the image back

    await act(async () => void (await vi.advanceTimersByTimeAsync(UNDO_NOTICE_MS + 100)));
    expect(undoNotice()).toBeNull();
    await waitFor(() => expect(bridge.historyFiles.size).toBe(0));
  });

  it("a newer delete ends the earlier notice: the earlier one can no longer be undone", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await capture(bridge, C, T3);

    await userEvent.click(within(strip()).getByRole("button", { name: `Delete image from ${WHEN1}` }));
    await waitFor(() => expect(bridge.trashedPaths).toHaveLength(1));
    await userEvent.click(within(strip()).getByRole("button", { name: `Delete image from ${WHEN2}` }));
    await waitFor(() => expect(bridge.trashedPaths).toHaveLength(2));
    expect(undoNotice()).toHaveTextContent("1 image moved");

    await userEvent.click(screen.getByRole("button", { name: "Undo delete" }));

    await waitFor(() => expect(bridge.restoredPaths).toHaveLength(1));
    expect(bridge.restoredPaths[0]).toContain("134602"); // only the latest delete
  });

  it("says so, and changes nothing, when the Recycle Bin move fails", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    bridge.failNextTrash("access denied");

    await userEvent.click(within(strip()).getByRole("button", { name: `Delete image from ${WHEN1}` }));

    expect(await screen.findByText(/Could not delete everything: access denied/)).toBeVisible();
    expect(bridge.libraryFiles).toHaveLength(2);
    expect(undoNotice()).toBeNull();
  });

  it("Undo tells the truth when a file could not be restored", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await userEvent.click(within(strip()).getByRole("button", { name: `Delete image from ${WHEN1}` }));
    await waitFor(() => expect(bridge.trashedPaths).toHaveLength(1));
    bridge.failNextRestore();

    await userEvent.click(screen.getByRole("button", { name: "Undo delete" }));

    expect(await screen.findByText(/Restored 0 of 1 images; the rest are in the Recycle Bin/)).toBeVisible();
  });

  it("Discard offers Undo too, and Undo brings the image back on show", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(bridge.discardedPaths).toHaveLength(1));
    expect(undoNotice()).toHaveTextContent("1 image moved to the Recycle Bin");
    await waitFor(() => expect(open(WHEN1)).toHaveAttribute("aria-current", "true"));

    await userEvent.click(screen.getByRole("button", { name: "Undo delete" }));
    await waitFor(() => expect(open(WHEN2)).toHaveAttribute("aria-current", "true"));
    expect(await shownPixels(bridge)).toEqual(B);
  });
});

describe("full-window grid (ticket 16)", () => {
  async function withThree() {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await capture(bridge, C, T3);
    await userEvent.click(within(strip()).getByRole("button", { name: "All captures (3)" }));
    return bridge;
  }

  it("All captures covers the window with date-grouped cards showing time and size", async () => {
    vi.setSystemTime(new Date(2026, 10, 15, 15, 0, 0));
    await withThree();

    const g = grid();
    expect(within(g).getByRole("heading", { name: "Today" })).toBeVisible();
    expect(within(g).getByText("3 captures")).toBeVisible();
    expect(within(g).getByText("13:47:03 · 2×2")).toBeVisible();
    expect(within(g).getAllByRole("button", { name: /^Open image/ })).toHaveLength(3);
    // The editor is still there underneath, out of reach.
    expect(document.querySelector(".editor-body")).toHaveAttribute("inert");
  });

  it("groups older captures under Yesterday, a weekday and a month", async () => {
    const bridge = createFakeBridge();
    const png = await encodeLibraryPng(createFromCapture(plainPng(A)));
    for (const at of [new Date(2026, 10, 15, 9), new Date(2026, 10, 14, 9), new Date(2026, 10, 12, 9), new Date(2026, 9, 3, 9)]) {
      bridge.addLibraryFile(png, { capturedAt: at });
    }
    vi.setSystemTime(new Date(2026, 10, 15, 15, 0, 0));
    await openEditor(bridge);
    await userEvent.click(await within(strip()).findByRole("button", { name: "All captures (4)" }));

    expect(within(grid()).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Today", "Yesterday", "Thursday 12 November", "October 2026"]);
  });

  it("opens a capture in the editor when clicked", async () => {
    const bridge = await withThree();
    await userEvent.click(open(WHEN1, grid()));
    await waitFor(() => expect(screen.queryByRole("region", { name: "All captures" })).toBeNull());
    await waitFor(() => expect(open(WHEN1)).toHaveAttribute("aria-current", "true"));
    expect(await shownPixels(bridge)).toEqual(A);
  });

  it("Esc and Back to editor leave the grid", async () => {
    await withThree();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "All captures" })).toBeNull();
    await userEvent.click(within(strip()).getByRole("button", { name: "All captures (3)" }));
    await userEvent.click(within(grid()).getByRole("button", { name: "Back to editor (Esc)" }));
    expect(screen.queryByRole("region", { name: "All captures" })).toBeNull();
  });

  it("selecting shows the counts, Delete N and Clear selection; Delete N and Undo work as in the strip", async () => {
    const bridge = await withThree();
    const g = grid();
    expect(within(g).queryByRole("button", { name: /^Delete \d/ })).toBeNull();

    clickWith(open(WHEN1, g), { ctrlKey: true });
    clickWith(open(WHEN2, g), { ctrlKey: true });
    expect(within(g).getByText("2 selected")).toBeVisible();

    await userEvent.click(within(g).getByRole("button", { name: "Clear selection" }));
    expect(within(g).queryByText(/selected/)).toBeNull();

    clickWith(open(WHEN1, g), { ctrlKey: true });
    clickWith(open(WHEN2, g), { ctrlKey: true });
    await userEvent.click(within(g).getByRole("button", { name: "Delete 2" }));

    await waitFor(() => expect(bridge.trashedPaths).toHaveLength(2));
    expect(within(grid()).getByText("1 capture")).toBeVisible();
    expect(undoNotice()).toHaveTextContent("2 images moved to the Recycle Bin");
    await userEvent.click(screen.getByRole("button", { name: "Undo delete" }));
    await waitFor(() => expect(within(grid()).getByText("3 captures")).toBeVisible());
  });

  it("hover Copy and ✕ work on grid cards", async () => {
    const bridge = await withThree();
    await userEvent.click(within(grid()).getByRole("button", { name: `Copy image from ${WHEN1}` }));
    await waitFor(() => expect(bridge.copiedImages).toHaveLength(1));
    expect(decodePixels(bridge.copiedImages[0]!).rgba).toEqual(A);

    await userEvent.click(within(grid()).getByRole("button", { name: `Delete image from ${WHEN1}` }));
    await waitFor(() => expect(bridge.trashedPaths).toHaveLength(1));
  });

  it("an empty Library says to press the hotkey", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await userEvent.click(await within(strip()).findByRole("button", { name: "All captures (0)" }));
    expect(await within(grid()).findByText("No captures yet. Press Ctrl+Shift+S to take your first capture.")).toBeVisible();
  });

  it("a new capture while the grid is open takes the window back to the editor", async () => {
    const bridge = await withThree();
    await capture(bridge, A, new Date(2026, 10, 15, 14, 0, 0));
    expect(screen.queryByRole("region", { name: "All captures" })).toBeNull();
  });
});

describe("the folder is the source of truth (ticket 17)", () => {
  it("a PNG dropped into the folder appears as an Annotated Image with no Annotations, and is not rewritten until edited", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge, A, T1);

    const dropped = bridge.addLibraryFile(plainPng(C), { path: "2026-11\\holiday.png" });
    await waitFor(() => expect(within(strip()).getByRole("button", { name: "All captures (2)" })).toBeVisible());
    const thumb = within(strip()).getAllByRole("button", { name: /^Open image/ })[0]!; // created just now: the newest
    await userEvent.click(thumb);

    await waitFor(() => expect(thumb).toHaveAttribute("aria-current", "true"));
    expect(await shownPixels(bridge)).toEqual(C);
    await waitFor(() => expect(kit.latest.model?.annotations).toEqual([]));
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(bridge.libraryUpdates.some((u) => u.path === dropped)).toBe(false); // opening wrote nothing

    await draw(kit, arrow("mine"));
    await autosave();
    await waitFor(() => expect(bridge.libraryUpdates.some((u) => u.path === dropped)).toBe(true));
    const written = bridge.libraryFiles.find((f) => f.path === dropped)!.bytes;
    expect(decodeLibraryPng(written).model.annotations.map((a) => a.id)).toEqual(["mine"]);
  });

  it("a file deleted in Explorer disappears from the strip", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);

    act(() => bridge.removeLibraryFile(bridge.libraryFiles.find((f) => f.path.includes("134501"))!.path));

    await waitFor(() => expect(stripPaths()).toEqual([`Open image from ${WHEN2}`]));
    expect(within(strip()).getByRole("button", { name: "All captures (1)" })).toBeVisible();
  });

  it("if the open image is deleted in Explorer, it is let go (never written back) and the next one shows", async () => {
    const bridge = createFakeBridge();
    const kit = await openEditor(bridge);
    await capture(bridge, A, T1);
    await capture(bridge, B, T2);
    await draw(kit, arrow("unsaved")); // an edit still waiting to be saved to a file that is about to vanish
    const gone = bridge.libraryFiles.find((f) => f.path.includes("134602"))!.path;
    const updates = bridge.libraryUpdates.length;

    act(() => bridge.removeLibraryFile(gone));

    await waitFor(() => expect(open(WHEN1)).toHaveAttribute("aria-current", "true"));
    expect(await screen.findByText(/was deleted outside the app/)).toBeVisible();
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(bridge.libraryFiles.map((f) => f.path)).not.toContain(gone); // not resurrected
    expect(bridge.libraryUpdates).toHaveLength(updates);
  });

  it("a file saved by a newer version opens read-only with a notice, and can still be copied", async () => {
    const bridge = createFakeBridge();
    const image = createFromCapture(plainPng(C));
    const newer = await encodeLibraryPng({ ...image, model: { ...image.model, formatVersion: 99 } });
    bridge.addLibraryFile(newer, { capturedAt: T1 });
    const kit = await openEditor(bridge);

    expect(await screen.findByText(/Opened read-only: it was saved by a newer version/)).toBeVisible();
    await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
    expect(kit.latest.interactive).toBe(false);
    expect(await shownPixels(bridge)).toEqual(C);
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(bridge.libraryUpdates).toEqual([]);
  });

  it("a folder that cannot be listed keeps what is shown and does not break the editor", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, A, T1);
    bridge.listLibrary = async () => {
      throw new Error("drive unplugged");
    };
    await capture(bridge, B, T2).catch(() => {});
    expect(stripPaths().length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("img", { name: "Capture" })).toBeVisible();
  });
});
