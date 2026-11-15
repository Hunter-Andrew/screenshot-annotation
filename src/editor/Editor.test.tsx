import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { decodePixels, hasChunk } from "../core/testing";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

// 2x2: red, green / blue, white. Supplied here so expectations are independent of the fake.
const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
const OTHER = [9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255];

beforeAll(() => {
  // jsdom has no object URLs; the image element's source is irrelevant to these tests.
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});

async function openEditor(bridge: FakeBridge) {
  render(<Editor bridge={bridge} />);
  // Let the editor subscribe to Captures before simulating one.
  await act(async () => {});
}

const capture = async (bridge: FakeBridge, rgba: number[], capturedAt: Date) => {
  const before = bridge.libraryFiles.length;
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba, capturedAt }));
  await waitFor(() => expect(bridge.libraryFiles).toHaveLength(before + 1));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
};

const FIRST = new Date(2026, 10, 15, 13, 45, 1);
const SECOND = new Date(2026, 10, 15, 13, 46, 2);

describe("empty state", () => {
  it("names the capture hotkey the user actually has", async () => {
    const bridge = createFakeBridge();
    await bridge.setHotkey("ctrl+alt+x");

    await openEditor(bridge);

    expect(screen.getByText("Press Ctrl+Alt+X to capture")).toBeVisible();
    expect(screen.queryByText(/Ctrl\+Shift\+S/)).toBeNull();
  });
});

describe("Save as PNG…", () => {
  it("writes a plain Export: same pixels, no embedded chunk", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, PIXELS, FIRST);
    expect(hasChunk(bridge.libraryFiles[0]!.bytes, "snAP")).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Save as PNG…" }));

    await waitFor(() => expect(bridge.savedAs).toHaveLength(1));
    const [saved] = bridge.savedAs;
    expect(Array.from(saved!.bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(hasChunk(saved!.bytes, "snAP")).toBe(false);
    expect(decodePixels(saved!.bytes)).toEqual({ width: 2, height: 2, rgba: PIXELS });
    expect(saved!.suggestedName).toBe("2026-11-15 134501.png");
    expect(await screen.findByText(/Saved a copy to/)).toBeVisible();
  });

  it("does nothing more when the dialog is cancelled", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, PIXELS, FIRST);
    bridge.cancelNextSaveAs();

    await userEvent.click(screen.getByRole("button", { name: "Save as PNG…" }));

    await waitFor(() => expect(screen.queryByText(/Saved a copy to/)).toBeNull());
    expect(bridge.savedAs).toEqual([]);
    expect(screen.getByRole("img", { name: "Capture" })).toBeVisible();
  });

  it("is disabled with no image", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    expect(screen.getByRole("button", { name: "Save as PNG…" })).toBeDisabled();
  });
});

describe("Discard", () => {
  it("removes the Library file and shows the empty state when it was the only image", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, PIXELS, FIRST);
    const path = bridge.libraryFiles[0]!.path;

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(bridge.libraryFiles).toEqual([]));
    expect(bridge.discardedPaths).toEqual([path]);
    expect(screen.queryByRole("img", { name: "Capture" })).toBeNull();
    expect(screen.getByText("Press Ctrl+Shift+S to capture")).toBeVisible();
  });

  it("shows the previous image afterwards when there is one, and leaves its file alone", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, PIXELS, FIRST);
    await capture(bridge, OTHER, SECOND);
    const [first, second] = bridge.libraryFiles.map((f) => f.path);

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(bridge.discardedPaths).toEqual([second]));
    expect(bridge.libraryFiles.map((f) => f.path)).toEqual([first]);
    expect(screen.getByRole("img", { name: "Capture" })).toBeVisible();
    // Copy now exports the earlier image.
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(bridge.copiedImages).toHaveLength(1));
    expect(decodePixels(bridge.copiedImages[0]!).rgba).toEqual(PIXELS);
  });

  it("Ctrl+Delete discards too", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, PIXELS, FIRST);

    await userEvent.keyboard("{Control>}{Delete}{/Control}");

    await waitFor(() => expect(bridge.libraryFiles).toEqual([]));
    expect(screen.getByText("Press Ctrl+Shift+S to capture")).toBeVisible();
  });

  it("keeps the image if the file could not be removed", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await capture(bridge, PIXELS, FIRST);
    bridge.failNextDiscard("file is locked");

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(await screen.findByText(/Could not discard: .*file is locked/)).toBeVisible();
    expect(screen.getByRole("img", { name: "Capture" })).toBeVisible();
    expect(bridge.libraryFiles).toHaveLength(1);
  });

  it("is disabled with no image", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
  });
});

describe("automatic copy of a new capture", () => {
  // The platform copies the plain cropped Capture itself when it delivers it (so it works even if
  // this window never loads); the editor only reports what happened, and never copies on its own.
  const arrive = async (bridge: FakeBridge, clipboard?: "copied" | "failed") => {
    await act(async () =>
      bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: FIRST, clipboard }),
    );
    await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  };

  it("says the capture is on the clipboard, next to the Library save", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);

    await arrive(bridge, "copied");

    expect(screen.getByRole("status")).toHaveTextContent(/Copied to clipboard/);
    expect(screen.getByRole("status")).toHaveTextContent(/Saved to/);
    expect(bridge.copiedImages).toHaveLength(1);
    expect(hasChunk(bridge.copiedImages[0]!, "snAP")).toBe(false);
    expect(decodePixels(bridge.copiedImages[0]!)).toEqual({ width: 2, height: 2, rgba: PIXELS });
  });

  it("does not copy again itself: no extra clipboard write on arrival, re-render or image switch", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await arrive(bridge, "copied");
    await capture(bridge, OTHER, SECOND); // no clipboard outcome: the platform did not copy this one
    await userEvent.click(screen.getByRole("button", { name: "Discard" })); // switches back to the first
    await waitFor(() => expect(screen.getByRole("img", { name: "Capture" })).toBeVisible());

    expect(bridge.copiedImages).toHaveLength(1);
    expect(screen.getByRole("status")).not.toHaveTextContent(/Copied to clipboard/);
  });

  it("still saves and shows the image when the clipboard failed, and says so without blocking", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);

    await arrive(bridge, "failed");

    expect(screen.getByRole("img", { name: "Capture" })).toBeVisible();
    expect(bridge.libraryFiles).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(/Could not copy to the clipboard/);
    expect(screen.getByRole("status")).toHaveTextContent(/capture\.log/);
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
  });

  it("the Copy button still copies a plain Export", async () => {
    const bridge = createFakeBridge();
    await openEditor(bridge);
    await arrive(bridge, "failed");

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(bridge.copiedImages).toHaveLength(1));
    expect(hasChunk(bridge.copiedImages[0]!, "snAP")).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });
});
