import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge, type FakeBridge } from "../platform/fakeBridge";
import { DRAWING_TOOLBAR_COLLAPSED_SIZE, DRAWING_TOOLBAR_SIZE } from "../shared/constants";
import { DrawingToolbar } from "./DrawingToolbar";

let bridge: FakeBridge;

async function show(remembered?: "pen") {
  bridge = createFakeBridge();
  if (remembered) await bridge.setDrawingTool(remembered);
  render(<DrawingToolbar bridge={bridge} />);
  await act(async () => {});
  return screen.getByRole("toolbar", { name: "Drawing tools" });
}

const button = (name: string) => screen.getByRole("button", { name });

describe("the Drawing mode toolbar", () => {
  it("has icon-only buttons in order: Arrow, Rectangle, Pen, Highlighter, a divider, Use apps, Undo, Collapse, Exit", async () => {
    const bar = await show();
    const children = Array.from(bar.children).filter((c) => !c.hasAttribute("data-grip")).map((c) => (c.getAttribute("role") === "separator" ? "|" : c.getAttribute("aria-label")));
    expect(children).toEqual(["Arrow", "Rectangle", "Pen", "Highlighter", "|", "Use apps", "Undo", "Collapse", "Exit"]);
    for (const b of within(bar).getAllByRole("button")) expect(b.textContent).toBe("");
  });

  it("gives every button a tooltip, with its key where it has one", async () => {
    await show();
    expect(button("Arrow")).toHaveAttribute("title", "Arrow (A)");
    expect(button("Rectangle")).toHaveAttribute("title", "Rectangle (R)");
    expect(button("Pen")).toHaveAttribute("title", "Pen (P)");
    expect(button("Highlighter")).toHaveAttribute("title", "Highlighter (H)");
    expect(button("Use apps")).toHaveAttribute("title", "Use apps");
    expect(button("Undo")).toHaveAttribute("title", "Undo (Ctrl+Z)");
    expect(button("Collapse")).toHaveAttribute("title", "Collapse");
    expect(button("Exit")).toHaveAttribute("title", "Exit (Esc)");
  });

  it("starts with Arrow highlighted", async () => {
    await show();
    expect(button("Arrow")).toHaveAttribute("aria-pressed", "true");
    expect(button("Pen")).toHaveAttribute("aria-pressed", "false");
  });

  it("starts on the tool remembered from earlier in the session", async () => {
    await show("pen");
    expect(button("Pen")).toHaveAttribute("aria-pressed", "true");
    expect(button("Arrow")).toHaveAttribute("aria-pressed", "false");
  });

  it("choosing a tool highlights it and tells the platform, so the overlays follow", async () => {
    await show();
    await userEvent.click(button("Highlighter"));
    expect(button("Highlighter")).toHaveAttribute("aria-pressed", "true");
    expect(button("Arrow")).toHaveAttribute("aria-pressed", "false");
    expect(bridge.drawingTool).toBe("highlight");
  });

  it("follows a tool chosen by a key on an overlay", async () => {
    await show();
    act(() => bridge.pretendDrawingTool("rect"));
    expect(button("Rectangle")).toHaveAttribute("aria-pressed", "true");
  });

  it("Use apps lets the mouse through, and pressing it again, or choosing a tool, takes it back", async () => {
    await show();
    await userEvent.click(button("Use apps"));
    expect(button("Use apps")).toHaveAttribute("aria-pressed", "true");
    expect(bridge.drawingClickThrough).toBe(true);
    await userEvent.click(button("Use apps"));
    expect(button("Use apps")).toHaveAttribute("aria-pressed", "false");
    expect(bridge.drawingClickThrough).toBe(false);
    await userEvent.click(button("Use apps"));
    await userEvent.click(button("Arrow")); // the tool it already had
    expect(button("Use apps")).toHaveAttribute("aria-pressed", "false");
    expect(bridge.drawingClickThroughCalls).toEqual([true, false, true, false]);
  });

  it("a key on an overlay that chooses a tool takes the mouse back too", async () => {
    await show();
    await userEvent.click(button("Use apps"));
    act(() => bridge.pretendDrawingTool("pen"));
    expect(bridge.drawingClickThrough).toBe(false);
  });

  it("Undo is off until something is drawn, then asks the overlay of the newest drawing to undo", async () => {
    await show();
    expect(button("Undo")).toBeDisabled();
    act(() => bridge.pretendDrawingEdit({ monitor: 1, edit: "commit" }));
    expect(button("Undo")).toBeEnabled();
    await userEvent.click(button("Undo"));
    expect(bridge.drawingUndos).toEqual([1]);
    act(() => bridge.pretendDrawingEdit({ monitor: 1, edit: "undo" }));
    expect(button("Undo")).toBeDisabled();
  });

  it("Collapse shrinks it to a small pill, and a click on the pill expands it again", async () => {
    await show();
    expect(bridge.drawingToolbarSize).toBeNull(); // the platform opened it at full size
    await userEvent.click(button("Collapse"));
    expect(bridge.drawingToolbarSize).toEqual(DRAWING_TOOLBAR_COLLAPSED_SIZE);
    expect(screen.queryByRole("button", { name: "Arrow" })).toBeNull();
    await userEvent.click(button("Expand"));
    expect(bridge.drawingToolbarSize).toEqual(DRAWING_TOOLBAR_SIZE);
    expect(button("Arrow")).toBeVisible();
  });

  it("keeps the tool, Use apps and the undo history through a collapse", async () => {
    await show();
    await userEvent.click(button("Pen"));
    await userEvent.click(button("Use apps"));
    act(() => bridge.pretendDrawingEdit({ monitor: 0, edit: "commit" }));
    await userEvent.click(button("Collapse"));
    await userEvent.click(button("Expand"));
    expect(button("Pen")).toHaveAttribute("aria-pressed", "true");
    expect(button("Use apps")).toHaveAttribute("aria-pressed", "true");
    expect(button("Undo")).toBeEnabled();
  });

  it("Exit leaves the mode", async () => {
    await show();
    await userEvent.click(button("Exit"));
    expect(bridge.drawingExits).toBe(1);
  });

  it("can be dragged by its background and its grip, and is transparent around the pill", async () => {
    const bar = await show();
    expect(bar).toHaveAttribute("data-tauri-drag-region");
    expect(bar.querySelector("[data-grip]")).toHaveAttribute("data-tauri-drag-region");
    expect(document.body.style.backgroundColor).toBe("transparent");
  });
});
