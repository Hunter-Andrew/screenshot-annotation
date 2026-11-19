import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { PointerDot } from "./PointerDot";

afterEach(() => vi.useRealTimers());

const rings = () => document.querySelectorAll("[data-ripple]");

describe("Pointer highlight dot window", () => {
  it("draws the red Medium laser dot in the middle of its window on a fresh install", async () => {
    render(<PointerDot bridge={createFakeBridge()} />);
    const dot = await screen.findByRole("img", { name: "Pointer highlight" });
    expect(dot).toHaveStyle({ width: "14px", height: "14px", background: "#e02424", left: "48px", top: "48px" });
    expect(dot.style.boxShadow).toContain("rgba(224, 36, 36, 0.7)");
  });

  it("follows a change of colour and size at once", async () => {
    const bridge = createFakeBridge();
    render(<PointerDot bridge={bridge} />);
    const dot = await screen.findByRole("img", { name: "Pointer highlight" });
    await act(() => bridge.setPointerSettings({ color: "#2563eb", size: "large", ripple: true }));
    expect(dot).toHaveStyle({ width: "20px", height: "20px", background: "#2563eb" });
  });

  it("moves the dot when the window is held back at a monitor's edge", async () => {
    const bridge = createFakeBridge();
    render(<PointerDot bridge={bridge} />);
    const dot = await screen.findByRole("img", { name: "Pointer highlight" });
    act(() => bridge.setPointerDot(20, 0));
    expect(dot).toHaveStyle({ left: "20px", top: "0px" });
  });

  it("shows a ripple ring in the pointer colour for a click and removes it after 400 ms", async () => {
    vi.useFakeTimers();
    const bridge = createFakeBridge();
    await bridge.setPointerSettings({ color: "#16a34a", size: "medium", ripple: true });
    bridge.pressPointerHotkey();
    render(<PointerDot bridge={bridge} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(rings()).toHaveLength(0);
    act(() => bridge.clickPointer());
    expect(rings()).toHaveLength(1);
    expect((rings()[0] as HTMLElement).style.borderColor).toBe("rgb(22, 163, 74)");
    act(() => vi.advanceTimersByTime(399));
    expect(rings()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2));
    expect(rings()).toHaveLength(0);
  });

  it("two quick clicks make two rings", async () => {
    vi.useFakeTimers();
    const bridge = createFakeBridge();
    bridge.pressPointerHotkey();
    render(<PointerDot bridge={bridge} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => bridge.clickPointer());
    act(() => vi.advanceTimersByTime(100));
    act(() => bridge.clickPointer());
    expect(rings()).toHaveLength(2);
  });

  it("is a transparent page: nothing but the dot and its rings", async () => {
    render(<PointerDot bridge={createFakeBridge()} />);
    await screen.findByRole("img", { name: "Pointer highlight" });
    expect(document.body.textContent).toBe("");
    expect(document.body.style.backgroundColor).toBe("transparent");
  });
});
