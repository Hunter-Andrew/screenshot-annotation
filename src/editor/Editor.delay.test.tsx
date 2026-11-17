import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { createStubKit } from "../canvas/stubKit";
import { createFakeBridge } from "../platform/fakeBridge";
import { Editor } from "./Editor";

beforeAll(() => {
  URL.createObjectURL = () => "blob:capture";
  URL.revokeObjectURL = () => {};
});

async function openEditor() {
  const bridge = createFakeBridge();
  render(<Editor bridge={bridge} kit={createStubKit()} />);
  await act(async () => {});
  return bridge;
}

describe("Delay timer in the top bar", () => {
  it("offers capture in 3s, 5s and 10s, in a group named for what it does", async () => {
    await openEditor();
    const group = screen.getByRole("group", { name: "Capture after a delay" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["3s", "5s", "10s"]);
  });

  it("starts the delay timer with the chosen number of seconds", async () => {
    const bridge = await openEditor();
    const group = screen.getByRole("group", { name: "Capture after a delay" });
    await userEvent.click(within(group).getByRole("button", { name: "Capture in 5 seconds" }));
    await userEvent.click(within(group).getByRole("button", { name: "Capture in 10 seconds" }));
    expect(bridge.delayedCaptures).toEqual([5, 10]);
  });

  it("each button says what it does to a screen reader and in its tooltip", async () => {
    await openEditor();
    expect(screen.getByRole("button", { name: "Capture in 3 seconds" })).toHaveAttribute("title", "Capture in 3 seconds");
  });

  it("does not take a capture by itself: the platform does that when the countdown ends", async () => {
    const bridge = await openEditor();
    await userEvent.click(screen.getByRole("button", { name: "Capture in 3 seconds" }));
    expect(bridge.libraryFiles).toHaveLength(0);
  });
});
