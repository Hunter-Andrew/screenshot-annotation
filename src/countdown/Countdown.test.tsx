import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { Countdown } from "./Countdown";

describe("Countdown badge", () => {
  it("shows the number the platform says is running", async () => {
    const bridge = createFakeBridge();
    bridge.setCountdown(5);
    render(<Countdown bridge={bridge} />);
    expect(await screen.findByRole("status")).toHaveTextContent("5");
  });

  it("counts down as the platform ticks", async () => {
    const bridge = createFakeBridge();
    bridge.setCountdown(3);
    render(<Countdown bridge={bridge} />);
    await screen.findByText("3");
    act(() => bridge.setCountdown(2));
    expect(await screen.findByText("2")).toBeVisible();
    act(() => bridge.setCountdown(1));
    expect(await screen.findByText("1")).toBeVisible();
  });

  it("shows no number once the countdown is over", async () => {
    const bridge = createFakeBridge();
    bridge.setCountdown(1);
    render(<Countdown bridge={bridge} />);
    await screen.findByText("1");
    act(() => bridge.setCountdown(null));
    const badge = screen.getByRole("status", { hidden: true });
    expect(badge).toBeEmptyDOMElement();
    expect(badge).not.toBeVisible();
  });

  it("is a transparent page: only the number, nothing else", async () => {
    const bridge = createFakeBridge();
    bridge.setCountdown(10);
    render(<Countdown bridge={bridge} />);
    await screen.findByText("10");
    expect(document.body.textContent).toBe("10");
  });
});
