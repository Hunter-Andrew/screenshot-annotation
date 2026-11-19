import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { DrawingOverlay } from "./DrawingOverlay";

// A 1000x500 CSS window on a 200% display: a pointer at CSS (100, 50) is physical (200, 100).
let bridge: FakeBridge;
let painted: string[];

const memory = (toolStyles?: unknown) => {
  const map = new Map<string, string>(toolStyles === undefined ? [] : [["fake.toolStyles", JSON.stringify(toolStyles)]]);
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
};

async function show(toolStyles?: unknown) {
  bridge = createFakeBridge({ storage: memory(toolStyles) });
  render(<DrawingOverlay bridge={bridge} monitor={0} />);
  // Wait until the stored styles have been read (the page then draws with them).
  await act(async () => {});
  return screen.getByTestId("drawing-canvas");
}

beforeEach(() => {
  Object.assign(window, { innerWidth: 1000, innerHeight: 500, devicePixelRatio: 2 });
  painted = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      new Proxy(
        {},
        {
          get: (_t, name: string) => (...args: unknown[]) => void painted.push(`${name}(${args.join(",")})`),
          set: (_t, name: string, value) => {
            painted.push(`${name}=${value}`);
            return true;
          },
        },
      ) as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => vi.restoreAllMocks());

const at = (canvas: HTMLElement, type: "pointerDown" | "pointerMove" | "pointerUp", x: number, y: number) =>
  fireEvent[type](canvas, { clientX: x, clientY: y, button: 0, pointerId: 1 });
const drag = (canvas: HTMLElement, from: [number, number], to: [number, number]) => {
  at(canvas, "pointerDown", ...from);
  at(canvas, "pointerMove", ...to);
  at(canvas, "pointerUp", ...to);
};
const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: k, ...init });
const count = (canvas: HTMLElement) => Number(canvas.dataset.drawings);

describe("Drawing mode overlay", () => {
  it("is a physical-pixel canvas over the whole window, with Arrow chosen and nothing drawn", async () => {
    const canvas = await show();
    expect(canvas).toHaveAttribute("width", "2000");
    expect(canvas).toHaveAttribute("height", "1000");
    expect(canvas.dataset.tool).toBe("arrow");
    expect(count(canvas)).toBe(0);
  });

  it("draws an arrow where the pointer was, in physical pixels, with the editor's saved arrow style", async () => {
    const canvas = await show({ arrow: { stroke: { color: "#00aa00", width: 9 }, arrowheads: { ends: "end" } } });
    drag(canvas, [100, 50], [400, 50]);
    expect(count(canvas)).toBe(1);
    expect(painted).toContain("strokeStyle=#00aa00");
    expect(painted).toContain("lineWidth=9");
    expect(painted).toContain("moveTo(200,100)");
  });

  it("A, R, P and H choose the tool and each draws its own shape", async () => {
    const canvas = await show();
    key("r");
    expect(canvas.dataset.tool).toBe("rect");
    drag(canvas, [10, 10], [110, 60]);
    expect(painted).toContain("strokeRect(20,20,200,100)");
    key("p");
    expect(canvas.dataset.tool).toBe("pen");
    drag(canvas, [10, 10], [110, 60]);
    key("h");
    expect(canvas.dataset.tool).toBe("highlight");
    painted.length = 0;
    drag(canvas, [10, 10], [110, 10]);
    expect(painted).toContain("globalAlpha=0.8");
    key("A");
    expect(canvas.dataset.tool).toBe("arrow");
    expect(count(canvas)).toBe(3);
  });

  it("a click without a drag draws nothing", async () => {
    const canvas = await show();
    at(canvas, "pointerDown", 50, 50);
    at(canvas, "pointerUp", 50, 50);
    expect(count(canvas)).toBe(0);
  });

  it("Ctrl+Z undoes and Ctrl+Y redoes", async () => {
    const canvas = await show();
    drag(canvas, [10, 10], [200, 100]);
    drag(canvas, [20, 20], [300, 200]);
    expect(count(canvas)).toBe(2);
    key("z", { ctrlKey: true });
    expect(count(canvas)).toBe(1);
    key("y", { ctrlKey: true });
    expect(count(canvas)).toBe(2);
  });

  it("a drawing never leaves its monitor", async () => {
    const canvas = await show();
    painted.length = 0;
    drag(canvas, [900, 400], [5000, 400]);
    // The window is 2000 physical pixels wide: the arrow ends there, not at 10000.
    expect(painted.filter((c) => c.startsWith("lineTo")).every((c) => Number(c.slice(7).split(",")[0]) <= 2000)).toBe(true);
  });

  it("Esc clears every drawing and asks the platform to leave the mode", async () => {
    const canvas = await show();
    drag(canvas, [10, 10], [200, 100]);
    key("Escape");
    expect(count(canvas)).toBe(0);
    expect(canvas.dataset.tool).toBe("arrow");
    await waitFor(() => expect(bridge.drawingExits).toBe(1));
  });

  it("keys it does not know do nothing, and a tool letter with Ctrl held is not a tool key", async () => {
    const canvas = await show();
    key("x");
    key("r", { ctrlKey: true });
    key("Enter");
    expect(canvas.dataset.tool).toBe("arrow");
    expect(bridge.drawingExits).toBe(0);
  });

  it("falls back to the default style when the stored one is unusable", async () => {
    const canvas = await show({ arrow: "nonsense" });
    drag(canvas, [100, 50], [400, 50]);
    expect(painted).toContain("strokeStyle=#e02424");
    expect(painted).toContain("lineWidth=4");
  });

  it("makes the page transparent, so only the drawings show", async () => {
    await show();
    expect(document.body.style.backgroundColor).toBe("transparent");
    expect(document.documentElement.style.backgroundColor).toBe("transparent");
  });
});

describe("Drawing mode overlay and its toolbar (ticket 53)", () => {
  it("starts on the tool the platform remembers from earlier in the session", async () => {
    bridge = createFakeBridge({ storage: memory() });
    await bridge.setDrawingTool("pen");
    render(<DrawingOverlay bridge={bridge} monitor={0} />);
    await act(async () => {});
    expect(screen.getByTestId("drawing-canvas").dataset.tool).toBe("pen");
  });

  it("follows a tool chosen on the toolbar or on another overlay", async () => {
    const canvas = await show();
    act(() => bridge.pretendDrawingTool("highlight"));
    expect(canvas.dataset.tool).toBe("highlight");
  });

  it("tells the platform which tool a key chose, so the toolbar and the other overlays follow", async () => {
    const canvas = await show();
    key("r");
    expect(canvas.dataset.tool).toBe("rect");
    expect(bridge.drawingTool).toBe("rect");
  });

  it("reports each drawing, undo and redo with its monitor, and nothing for an undo with nothing to undo", async () => {
    bridge = createFakeBridge({ storage: memory() });
    const edits: unknown[] = [];
    await bridge.onDrawingEdit((e) => edits.push(e));
    render(<DrawingOverlay bridge={bridge} monitor={3} />);
    await act(async () => {});
    const canvas = screen.getByTestId("drawing-canvas");
    key("z", { ctrlKey: true });
    drag(canvas, [10, 10], [200, 100]);
    key("z", { ctrlKey: true });
    key("y", { ctrlKey: true });
    key("y", { ctrlKey: true });
    await waitFor(() => expect(edits).toEqual([
      { monitor: 3, edit: "commit" },
      { monitor: 3, edit: "undo" },
      { monitor: 3, edit: "redo" },
    ]));
  });

  it("undoes its last drawing when the toolbar asks for this monitor, and ignores a request for another", async () => {
    const canvas = await show();
    drag(canvas, [10, 10], [200, 100]);
    await act(async () => bridge.undoDrawing(1));
    expect(count(canvas)).toBe(1);
    await act(async () => bridge.undoDrawing(0));
    expect(count(canvas)).toBe(0);
  });
});

