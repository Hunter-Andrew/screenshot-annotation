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
    expect(painted).toContain("globalAlpha=0.2");
    key("A");
    expect(canvas.dataset.tool).toBe("arrow");
    expect(count(canvas)).toBe(3);
  });

  it("the Highlighter uses the Drawing mode opacity setting and the editor's colour and thickness, never the editor's opacity", async () => {
    bridge = createFakeBridge({
      storage: memory({ highlight: { stroke: { color: "#ff00ff", width: 12 }, opacity: { value: 0.8 } } }),
    });
    await bridge.setDrawingHighlighterOpacity(45);
    render(<DrawingOverlay bridge={bridge} monitor={0} />);
    await act(async () => {});
    const canvas = screen.getByTestId("drawing-canvas");
    key("h");
    painted.length = 0;
    drag(canvas, [10, 10], [110, 10]);
    expect(painted).toContain("globalAlpha=0.45");
    expect(painted).not.toContain("globalAlpha=0.8");
    expect(painted).toContain("lineWidth=12");
    expect(painted).toContain("strokeStyle=#ff00ff");
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
  it("always starts on Arrow, even when another tool was chosen earlier in the session", async () => {
    bridge = createFakeBridge({ storage: memory() });
    await bridge.setDrawingTool("pen");
    render(<DrawingOverlay bridge={bridge} monitor={0} />);
    await act(async () => {});
    expect(screen.getByTestId("drawing-canvas").dataset.tool).toBe("arrow");
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

  describe("the Eraser", () => {
    // A Pen stroke along y = 100 CSS (200 physical) from x = 100 to 400 CSS, drawn through six pointer positions.
    const penStroke = (canvas: HTMLElement) => {
      key("p");
      at(canvas, "pointerDown", 100, 100);
      for (const x of [150, 200, 250, 300, 350]) at(canvas, "pointerMove", x, 100);
      at(canvas, "pointerUp", 400, 100);
    };
    const saved = (size: number) => ({ pen: { stroke: { color: "#e02424", width: 4 }, eraser: { mode: "pen", size } } });

    it("E chooses it, and the platform is told so the toolbar follows", async () => {
      const canvas = await show();
      const chosen: string[] = [];
      await bridge.onDrawingTool((tool) => chosen.push(tool));
      key("e");
      expect(canvas.dataset.tool).toBe("eraser");
      await waitFor(() => expect(chosen).toEqual(["eraser"]));
    });

    it("cuts a Pen stroke in two where it passes, and one Undo puts the stroke back", async () => {
      const canvas = await show(saved(40));
      penStroke(canvas);
      expect(count(canvas)).toBe(1);
      key("e");
      drag(canvas, [250, 100], [250, 100]);
      expect(count(canvas)).toBe(2);
      key("z", { ctrlKey: true });
      expect(count(canvas)).toBe(1);
      key("y", { ctrlKey: true });
      expect(count(canvas)).toBe(2);
    });

    it("uses the eraser size saved in the editor: the same drag misses with a small eraser and hits with a big one", async () => {
      // 20 CSS px below the stroke is 40 physical px away.
      const small = await show(saved(20));
      penStroke(small);
      key("e");
      drag(small, [250, 120], [250, 120]);
      expect(count(small)).toBe(1);
      document.body.innerHTML = "";

      const big = await show(saved(100));
      penStroke(big);
      key("e");
      drag(big, [250, 120], [250, 120]);
      expect(count(big)).toBe(2);
    });

    it("uses the editor's default size when none is saved", async () => {
      // The default is 20 px across: 4 physical px away is inside it, 40 is not.
      const canvas = await show();
      penStroke(canvas);
      key("e");
      drag(canvas, [250, 120], [250, 120]);
      expect(count(canvas)).toBe(1);
      drag(canvas, [250, 102], [250, 102]);
      expect(count(canvas)).toBe(2);
    });

    it("removes a stroke it covers entirely", async () => {
      const canvas = await show(saved(100));
      key("p");
      drag(canvas, [100, 100], [110, 100]);
      expect(count(canvas)).toBe(1);
      key("e");
      drag(canvas, [95, 100], [120, 100]);
      expect(count(canvas)).toBe(0);
    });

    it("never touches an Arrow, a Rectangle or a Highlighter stroke, and a drag that touches nothing is no Undo step", async () => {
      bridge = createFakeBridge({ storage: memory(saved(100)) });
      const edits: unknown[] = [];
      await bridge.onDrawingEdit((e) => edits.push(e));
      render(<DrawingOverlay bridge={bridge} monitor={0} />);
      await act(async () => {});
      const canvas = screen.getByTestId("drawing-canvas");
      drag(canvas, [100, 100], [400, 100]); // an Arrow
      key("r");
      drag(canvas, [100, 200], [300, 300]);
      key("h");
      drag(canvas, [100, 400], [300, 400]);
      expect(count(canvas)).toBe(3);
      key("e");
      drag(canvas, [100, 100], [300, 400]);
      expect(count(canvas)).toBe(3);
      await waitFor(() => expect(edits).toHaveLength(3));
    });

    it("reports a cut as one drawing step of its monitor", async () => {
      bridge = createFakeBridge({ storage: memory(saved(40)) });
      const edits: unknown[] = [];
      await bridge.onDrawingEdit((e) => edits.push(e));
      render(<DrawingOverlay bridge={bridge} monitor={2} />);
      await act(async () => {});
      const canvas = screen.getByTestId("drawing-canvas");
      penStroke(canvas);
      key("e");
      drag(canvas, [250, 100], [250, 100]);
      await waitFor(() => expect(edits).toEqual([{ monitor: 2, edit: "commit" }, { monitor: 2, edit: "commit" }]));
    });

    it("shows a circle the size of the eraser at the pointer instead of the crosshair", async () => {
      const canvas = await show(saved(40));
      key("e");
      at(canvas, "pointerMove", 100, 50);
      expect(canvas.style.cursor).toBe("none");
      expect(painted).toContain("arc(200,100,20,0,6.283185307179586)");
    });
  });
});
