import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Overlay } from "./Overlay";

// The overlay shows one monitor's frozen frame stretched over its window. These tests pin the
// window at 1000x500 CSS pixels over a 2000x1000 physical monitor (a 200% display), so every
// region the user drags must come out at twice the CSS numbers.
const FRAME = { width: 2000, height: 1000 };

let bridge: FakeBridge;

// Windows on the monitor, native pixels local to it, topmost first (as the platform reports them).
const WINDOWS = [
  { x: 1000, y: 200, width: 400, height: 200 }, // a dialog: CSS 500,100 200x100
  { x: 200, y: 100, width: 1200, height: 800 }, // the big window: CSS 100,50 600x400
];

/** Fake settings storage holding `fake.magnifier` as the platform would have saved it (absent: a fresh install). */
const storedMagnifier = (value?: "0" | "1") => {
  const memory = new Map<string, string>(value === undefined ? [] : [["fake.magnifier", value]]);
  return { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
};

async function showOverlay(monitor = 1, windows: typeof WINDOWS = [], storage = storedMagnifier("0")) {
  Object.assign(window, { innerWidth: 1000, innerHeight: 500 });
  bridge = createFakeBridge({ overlayFrames: { [monitor]: FRAME }, overlayWindows: { [monitor]: windows }, storage });
  render(<Overlay bridge={bridge} monitor={monitor} />);
  const frozen = await screen.findByRole("img", { name: "Frozen screen" });
  fireEvent.load(frozen); // jsdom never decodes images, so announce the decode ourselves
  await waitFor(() => expect(bridge.readyOverlays).toEqual([monitor]));
}

const press = (x: number, y: number) =>
  fireEvent.pointerDown(screen.getByTestId("overlay"), { clientX: x, clientY: y, button: 0, pointerId: 1 });
const move = (x: number, y: number) =>
  fireEvent.pointerMove(screen.getByTestId("overlay"), { clientX: x, clientY: y, pointerId: 1 });
const release = (x: number, y: number) =>
  fireEvent.pointerUp(screen.getByTestId("overlay"), { clientX: x, clientY: y, button: 0, pointerId: 1 });

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:frozen", revokeObjectURL: () => {} }));
});

describe("Overlay region mode", () => {
  it("asks for this monitor's frozen frame and reports ready once it is on screen", async () => {
    await showOverlay(2);
    expect(bridge.overlayFrameRequests).toEqual([2]);
  });

  it("releasing a drag captures that region immediately, in native pixels, from the starting monitor", async () => {
    await showOverlay(1);
    press(100, 50);
    move(300, 130);
    release(300, 130);
    await waitFor(() =>
      expect(bridge.overlayOutcomes).toEqual([
        { kind: "region", monitor: 1, region: { x: 200, y: 100, width: 400, height: 160 } },
      ]),
    );
  });

  it("clamps the region at the monitor edge when the drag runs off it", async () => {
    await showOverlay(1);
    press(900, 450);
    move(1400, 900);
    release(1400, 900);
    await waitFor(() =>
      expect(bridge.overlayOutcomes).toEqual([
        { kind: "region", monitor: 1, region: { x: 1800, y: 900, width: 200, height: 100 } },
      ]),
    );
  });

  it("shows the pixel size of the selection while dragging", async () => {
    await showOverlay(1);
    press(100, 50);
    move(300, 130);
    expect(screen.getByText("400 × 160")).toBeVisible();
  });

  it("a click without a drag captures nothing", async () => {
    await showOverlay(1);
    press(100, 50);
    release(100, 50);
    expect(bridge.overlayOutcomes).toEqual([]);
  });

  it("Space captures the whole monitor under the cursor", async () => {
    await showOverlay(1);
    fireEvent.keyDown(window, { key: " " });
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "monitor" }]));
  });

  it("Space still captures the monitor when Ctrl or Alt is held (it did before shortcuts were remappable)", async () => {
    await showOverlay(1);
    fireEvent.keyDown(window, { key: " ", ctrlKey: true });
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "monitor" }]));
  });

  it("M still toggles the magnifier when Alt is held", async () => {
    await showOverlay(1);
    move(100, 100);
    fireEvent.keyDown(window, { key: "m", altKey: true });
    expect(await screen.findByTestId("magnifier")).toBeVisible();
  });

  it("Esc cancels", async () => {
    await showOverlay(1);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "cancel" }]));
  });

  it("Esc during a drag cancels, and the later release captures nothing more", async () => {
    await showOverlay(1);
    press(10, 10);
    move(50, 50);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "cancel" }]));
    release(50, 50);
    expect(bridge.overlayOutcomes).toEqual([{ kind: "cancel" }]); // no region after cancelling
  });

  it("M toggles the magnifier and stores the new state", async () => {
    await showOverlay(1); // stored off
    move(100, 100);
    expect(screen.queryByTestId("magnifier")).toBeNull();
    fireEvent.keyDown(window, { key: "m" });
    expect(await screen.findByTestId("magnifier")).toBeVisible();
    await waitFor(() => expect(bridge.magnifier).toBe(true));
    fireEvent.keyDown(window, { key: "M" });
    await waitFor(() => expect(screen.queryByTestId("magnifier")).toBeNull());
    expect(bridge.magnifier).toBe(false);
  });

  it("a shortcut remapped in Settings applies to this open overlay at once", async () => {
    await showOverlay(1); // magnifier stored off
    move(100, 100);
    await act(() => bridge.setShortcutOverrides({ "overlay.magnifier": "N" }));
    fireEvent.keyDown(window, { key: "m" }); // the old key does nothing
    expect(screen.queryByTestId("magnifier")).toBeNull();
    fireEvent.keyDown(window, { key: "n" });
    expect(await screen.findByTestId("magnifier")).toBeVisible();
  });

  it("follows the value another overlay (another monitor) stored", async () => {
    await showOverlay(1);
    move(100, 100);
    await act(() => bridge.setMagnifier(true));
    expect(await screen.findByTestId("magnifier")).toBeVisible();
    await act(() => bridge.setMagnifier(false));
    await waitFor(() => expect(screen.queryByTestId("magnifier")).toBeNull());
  });

  it("starts with the magnifier on when the stored setting is on, before any key press", async () => {
    await showOverlay(1, [], storedMagnifier("1"));
    move(100, 100);
    expect(await screen.findByTestId("magnifier")).toBeVisible();
  });

  it("starts with the magnifier off when the stored setting is off", async () => {
    await showOverlay(1, [], storedMagnifier("0"));
    move(100, 100);
    await waitFor(() => expect(bridge.magnifier).toBe(false));
    expect(screen.queryByTestId("magnifier")).toBeNull();
  });

  it("is on by default on a fresh install", async () => {
    await showOverlay(1, [], storedMagnifier());
    move(100, 100);
    expect(await screen.findByTestId("magnifier")).toBeVisible();
  });

  it("a magnifier setting that cannot be read leaves the overlay working, magnifier off", async () => {
    await showOverlay(1);
    bridge.getMagnifier = async () => {
      throw new Error("boom");
    };
    cleanup();
    Object.assign(window, { innerWidth: 1000, innerHeight: 500 });
    render(<Overlay bridge={bridge} monitor={1} />);
    fireEvent.load(await screen.findByRole("img", { name: "Frozen screen" }));
    move(100, 100);
    fireEvent.keyDown(window, { key: " " });
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "monitor" }]));
    expect(screen.queryByTestId("magnifier")).toBeNull();
  });

  it("draws crosshair guides at the pointer", async () => {
    await showOverlay(1);
    move(120, 80);
    expect(screen.getByTestId("guide-x")).toHaveStyle({ left: "120px" });
    expect(screen.getByTestId("guide-y")).toHaveStyle({ top: "80px" });
  });
});

describe("Overlay window mode", () => {
  it("asks for the windows of its own monitor", async () => {
    await showOverlay(2, WINDOWS);
    expect(bridge.overlayWindowRequests).toEqual([2]);
  });

  it("hovering highlights the window under the pointer, with its pixel size", async () => {
    await showOverlay(1, WINDOWS);
    move(300, 100); // CSS -> native 600,200: inside the big window only
    const highlight = await screen.findByTestId("window-highlight");
    expect(highlight).toHaveStyle({ left: "100px", top: "50px", width: "600px", height: "400px" });
    expect(screen.getByText("1200 × 800")).toBeVisible();
  });

  it("the highlight follows the pointer to the window on top", async () => {
    await showOverlay(1, WINDOWS);
    move(300, 100);
    await screen.findByTestId("window-highlight");
    move(550, 130); // native 1100,260: the dialog sits over the big window here
    await waitFor(() =>
      expect(screen.getByTestId("window-highlight")).toHaveStyle({ left: "500px", top: "100px", width: "200px", height: "100px" }),
    );
  });

  it("shows no highlight over the bare desktop", async () => {
    await showOverlay(1, WINDOWS);
    move(950, 480);
    expect(screen.queryByTestId("window-highlight")).toBeNull();
  });

  it("a click captures the highlighted window", async () => {
    await showOverlay(1, WINDOWS);
    move(550, 130);
    press(550, 130);
    release(550, 130);
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "window", monitor: 1, window: 0 }]));
  });

  it("a click over the bare desktop captures nothing", async () => {
    await showOverlay(1, WINDOWS);
    move(950, 480);
    press(950, 480);
    release(950, 480);
    expect(bridge.overlayOutcomes).toEqual([]);
  });

  it("dragging from over a window still captures the dragged region, and hides the highlight meanwhile", async () => {
    await showOverlay(1, WINDOWS);
    move(300, 100);
    press(300, 100);
    move(400, 200);
    expect(screen.queryByTestId("window-highlight")).toBeNull();
    release(400, 200);
    await waitFor(() =>
      expect(bridge.overlayOutcomes).toEqual([
        { kind: "region", monitor: 1, region: { x: 600, y: 200, width: 200, height: 200 } },
      ]),
    );
  });
});

describe("Overlay failures", () => {
  it("reports a failed frozen-frame request to the log and cancels so the platform tears down", async () => {
    Object.assign(window, { innerWidth: 1000, innerHeight: 500 });
    bridge = createFakeBridge({ overlayFrames: { 0: FRAME } });
    bridge.failNextOverlayFrame("decode exploded");
    render(<Overlay bridge={bridge} monitor={0} />);
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "cancel" }]));
    expect(bridge.overlayLogs).toHaveLength(1);
    expect(bridge.overlayLogs[0]).toMatchObject({ fatal: true });
    expect(bridge.overlayLogs[0].message).toMatch(/overlayFrame.*decode exploded/);
  });

  it("logs uncaught page errors and unhandled rejections, and cancels on them", async () => {
    await showOverlay(0);
    act(() => {
      window.dispatchEvent(new ErrorEvent("error", { message: "boom", filename: "x.js", lineno: 3 }));
    });
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "cancel" }]));
    expect(bridge.overlayLogs.some((l) => l.fatal && /boom/.test(l.message))).toBe(true);
  });

  it("logs unhandled rejections", async () => {
    await showOverlay(0);
    const event = Object.assign(new Event("unhandledrejection"), { reason: new Error("nope") });
    act(() => {
      window.dispatchEvent(event);
    });
    await waitFor(() => expect(bridge.overlayLogs.some((l) => /nope/.test(l.message))).toBe(true));
  });
});

describe("Overlay pre-warmed (ADR 0003): loaded and hidden until a capture begins", () => {
  const warm = () => {
    Object.assign(window, { innerWidth: 1000, innerHeight: 500 });
    bridge = createFakeBridge({ overlayFrames: { 0: FRAME }, overlayAttempt: null, storage: storedMagnifier("0") });
    render(<Overlay bridge={bridge} monitor={0} />);
  };
  const show = async () => {
    fireEvent.load(await screen.findByRole("img", { name: "Frozen screen" }));
    await waitFor(() => expect(bridge.readyOverlays.length).toBeGreaterThan(0));
  };

  it("while idle it asks for no frame, shows no picture and never reports ready", async () => {
    warm();
    await act(async () => {});
    expect(screen.queryByRole("img", { name: "Frozen screen" })).toBeNull();
    expect(bridge.overlayFrameRequests).toEqual([]);
    expect(bridge.overlayWindowRequests).toEqual([]);
    expect(bridge.readyOverlays).toEqual([]);
  });

  it("when a capture begins it loads its monitor's frame and reports ready", async () => {
    warm();
    await act(async () => {});
    act(() => bridge.setOverlayAttempt(7));
    await show();
    expect(bridge.overlayFrameRequests).toEqual([0]);
    expect(bridge.readyOverlays).toEqual([0]);
  });

  it("a page that loads after the capture began still shows it (the event came too early)", async () => {
    Object.assign(window, { innerWidth: 1000, innerHeight: 500 });
    bridge = createFakeBridge({ overlayFrames: { 0: FRAME }, overlayAttempt: 4, storage: storedMagnifier("0") });
    render(<Overlay bridge={bridge} monitor={0} />);
    await show();
    expect(bridge.overlayFrameRequests).toEqual([0]);
  });

  it("is idle again when the capture ends: the frozen frame is dropped", async () => {
    warm();
    await act(async () => {});
    act(() => bridge.setOverlayAttempt(1));
    await show();
    act(() => bridge.setOverlayAttempt(null));
    await waitFor(() => expect(screen.queryByRole("img", { name: "Frozen screen" })).toBeNull());
    expect(screen.queryByTestId("guide-x")).toBeNull();
  });

  it("works for the next capture too, from a clean slate (a finished capture does not block it)", async () => {
    warm();
    await act(async () => {});
    act(() => bridge.setOverlayAttempt(1));
    await show();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "cancel" }]));
    act(() => bridge.setOverlayAttempt(null));
    await waitFor(() => expect(screen.queryByRole("img", { name: "Frozen screen" })).toBeNull());

    act(() => bridge.setOverlayAttempt(2));
    await show();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(bridge.overlayOutcomes).toEqual([{ kind: "cancel" }, { kind: "cancel" }]));
    expect(bridge.overlayFrameRequests).toEqual([0, 0]);
  });

  it("hearing the same attempt twice (event, then the page's own query) loads the frame once", async () => {
    warm();
    await act(async () => {});
    act(() => {
      bridge.setOverlayAttempt(3);
      bridge.setOverlayAttempt(3);
    });
    await show();
    expect(bridge.overlayFrameRequests).toEqual([0]);
  });
});
