// The editor's pointer toggle (ticket 51): the button, and how it and the tools exclude each other. The state
// rules themselves are in laserPointerMode.test.ts; stub canvas, the real-Fabric run is e2e/editor-pointer.spec.ts.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { createStubKit, type StubKit } from "../canvas/stubKit";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});

async function openWithCapture(bridge: FakeBridge, kit: StubKit = createStubKit()) {
  render(<Editor bridge={bridge} kit={kit} />);
  await act(async () => {});
  await act(async () => bridge.simulateCapture({ width: 2, height: 2, rgba: PIXELS, capturedAt: new Date(2026, 10, 15) }));
  await waitFor(() => expect(screen.getByText(/Saved to/)).toBeVisible());
  await waitFor(() => expect(kit.canvases.length).toBeGreaterThan(0));
  return kit;
}

const pointerButton = () => screen.getByRole("button", { name: "Laser pointer" });
const tool = (name: RegExp) => screen.getByRole("button", { name });
const pressed = () => screen.getByRole("navigation", { name: "Tools" }).querySelectorAll('.tool[aria-pressed="true"]').length;

describe("the pointer toggle in the tool column", () => {
  it("sits after the tools, is not pressed at first and names the pointer hotkey in its tooltip", async () => {
    await openWithCapture(createFakeBridge());
    const buttons = screen.getByRole("navigation", { name: "Tools" }).querySelectorAll("button");
    expect(buttons[buttons.length - 1]).toBe(pointerButton());
    expect(pointerButton()).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(pointerButton()).toHaveAttribute("title", "Laser pointer (Ctrl+Shift+L)"));
    expect(tool(/^Select/)).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking it turns the pointer on: pressed, no tool selected, the canvas ignores input", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await userEvent.keyboard("r");

    await userEvent.click(pointerButton());

    expect(bridge.laserPointerOn).toBe(true);
    expect(pointerButton()).toHaveAttribute("aria-pressed", "true");
    expect(pressed()).toBe(0);
    expect(kit.latest.interactive).toBe(false);
  });

  it("clicking it again turns the pointer off and selects Select", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await userEvent.keyboard("r");
    await userEvent.click(pointerButton());

    await userEvent.click(pointerButton());

    expect(bridge.laserPointerOn).toBe(false);
    expect(pointerButton()).toHaveAttribute("aria-pressed", "false");
    expect(tool(/^Select/)).toHaveAttribute("aria-pressed", "true");
    expect(pressed()).toBe(1);
    expect(kit.latest.interactive).toBe(true);
    expect(kit.latest.tool).toBe("select");
  });

  it("follows the hotkey or tray: on, then off with Select selected", async () => {
    const bridge = createFakeBridge();
    await openWithCapture(bridge);
    await userEvent.keyboard("p");

    act(() => bridge.pressLaserPointerHotkey());
    expect(pointerButton()).toHaveAttribute("aria-pressed", "true");
    expect(pressed()).toBe(0);

    act(() => bridge.pressLaserPointerHotkey());
    expect(pointerButton()).toHaveAttribute("aria-pressed", "false");
    expect(tool(/^Select/)).toHaveAttribute("aria-pressed", "true");
  });

  it("picking a tool by click turns the pointer off and selects that tool", async () => {
    const bridge = createFakeBridge();
    const kit = await openWithCapture(bridge);
    await userEvent.click(pointerButton());

    await userEvent.click(tool(/^Pen \(P\)/));

    expect(bridge.laserPointerOn).toBe(false);
    expect(pointerButton()).toHaveAttribute("aria-pressed", "false");
    expect(tool(/^Pen \(P\)/)).toHaveAttribute("aria-pressed", "true");
    expect(kit.latest.tool).toBe("pen");
    expect(kit.latest.interactive).toBe(true);
  });

  it("picking a tool by key does the same, Select's key included", async () => {
    const bridge = createFakeBridge();
    await openWithCapture(bridge);
    await userEvent.click(pointerButton());
    await userEvent.keyboard("r");
    expect(bridge.laserPointerOn).toBe(false);
    expect(tool(/^Rectangle/)).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(pointerButton());
    await userEvent.keyboard("v");
    expect(bridge.laserPointerOn).toBe(false);
    expect(tool(/^Select/)).toHaveAttribute("aria-pressed", "true");
  });

  it("is already on when the editor opens with the pointer on", async () => {
    const bridge = createFakeBridge();
    await bridge.setLaserPointer(true);
    await openWithCapture(bridge);
    expect(pointerButton()).toHaveAttribute("aria-pressed", "true");
    expect(pressed()).toBe(0);
  });
});
