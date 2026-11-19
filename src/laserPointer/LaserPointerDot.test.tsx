import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { LaserPointerDot } from "./LaserPointerDot";

afterEach(() => vi.useRealTimers());

const rings = () => document.querySelectorAll("[data-ripple]");

describe("Laser pointer dot window", () => {
  const layer = (dot: HTMLElement, name: string) => dot.querySelector(`[data-layer="${name}"]`) as HTMLElement;

  it("draws the red Medium Laser pointer (haze, ring, hot core) in the middle of its window on a fresh install", async () => {
    render(<LaserPointerDot bridge={createFakeBridge()} />);
    const dot = await screen.findByRole("img", { name: "Laser pointer" });
    expect(dot).toHaveStyle({ left: "48px", top: "48px" });
    expect(layer(dot, "haze")).toHaveStyle({ width: "70px", height: "70px" });
    expect(layer(dot, "haze").style.background).toContain("rgba(224, 36, 36, 0.5)");
    expect(layer(dot, "ring")).toHaveStyle({ width: "36px", height: "36px" });
    expect(layer(dot, "ring").style.border).toBe("1.5px solid rgba(224, 36, 36, 0.55)");
    expect(layer(dot, "hot")).toHaveStyle({ width: "8px", height: "8px" });
    expect(layer(dot, "hot").style.boxShadow).toContain("rgba(224, 36, 36, 0.8)");
  });

  it("follows a change of colour and size at once", async () => {
    const bridge = createFakeBridge();
    render(<LaserPointerDot bridge={bridge} />);
    const dot = await screen.findByRole("img", { name: "Laser pointer" });
    await act(() => bridge.setLaserPointerSettings({ color: "#2563eb", size: "large", ripple: true }));
    expect(layer(dot, "haze")).toHaveStyle({ width: "90px", height: "90px" });
    expect(layer(dot, "hot").style.boxShadow).toContain("rgba(37, 99, 235, 0.8)");
  });

  it("moves the dot when the window is held back at a monitor's edge", async () => {
    const bridge = createFakeBridge();
    render(<LaserPointerDot bridge={bridge} />);
    const dot = await screen.findByRole("img", { name: "Laser pointer" });
    act(() => bridge.setLaserPointerDot(20, 0));
    expect(dot).toHaveStyle({ left: "20px", top: "0px" });
  });

  it("shows a ripple ring in the pointer colour for a click and removes it after 400 ms", async () => {
    vi.useFakeTimers();
    const bridge = createFakeBridge();
    await bridge.setLaserPointerSettings({ color: "#16a34a", size: "medium", ripple: true });
    bridge.pressLaserPointerHotkey();
    render(<LaserPointerDot bridge={bridge} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(rings()).toHaveLength(0);
    act(() => bridge.clickLaserPointer());
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
    bridge.pressLaserPointerHotkey();
    render(<LaserPointerDot bridge={bridge} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => bridge.clickLaserPointer());
    act(() => vi.advanceTimersByTime(100));
    act(() => bridge.clickLaserPointer());
    expect(rings()).toHaveLength(2);
  });

  it("is a transparent page: nothing but the dot and its rings", async () => {
    render(<LaserPointerDot bridge={createFakeBridge()} />);
    await screen.findByRole("img", { name: "Laser pointer" });
    expect(document.body.textContent).toBe("");
    expect(document.body.style.backgroundColor).toBe("transparent");
  });
});
